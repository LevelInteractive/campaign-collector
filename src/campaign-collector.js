export default class CampaignCollector
{
  #_libraryName = 'CampaignCollector';
  #config = null;

  #defaults = {
    cookieDomain: null,
    decorateHostnames: [],
    enableSpaSupport: false,
    fieldMap: {
      $json: 'campaign_json',
      last: {
        utm: null,
        $ns: null,
      },
      first: {
        utm: null,
        $ns: null,
      },
      cookies: {},
      globals: {},
    },
    fieldTargetMethod: ['name'],
    fieldDataAttribute: 'data-campaign-collector',
    filters: {},
    jars: {
      google: '^_ga|_gcl_',
      linkedin: 'li_fat_id',
      meta: '^_fb(?:c|p)',
      microsoft: '^_uet',
      x: '_twclid',
    },
    namespace: 'lvl',
    parseRules: {
      organic: {
        google: '^www\.(google)\.[a-z]{2,3}(?:\.[a-z]{2})?$',
        bing: '^www\.(bing)\.com$',
        duckduckgo: '^(duckduckgo)\.com$',
        yahoo: '^(?:www|m)?\.?(yahoo)\.(?:com|cn)$',
        ecosia: '^www\.(ecosia)\.org$',
        ask: '^www\.(ask)\.com$',
        aol: '^(?:search\.)?(aol)\.com$',
        baidu: '^www\.(baidu)\.com$',
        xfinity: '^my|search\.(xfinity)\.com',
        yandex: '^(?:www\.)?(yandex)\.com|ru$',
        lycos: '^(?:www|search)?\.?(lycos).[a-z]{2,3}(?:\.[a-z]{2})?$'
      },
      social: {
        facebook: '^www\.(facebook)\.com$',
        instagram: '^l\.(instagram)\.com$',
        linkedin: '^www\.(linkedin)\.com$',
        x: '^t\.co|x\.com$',
      }
    },
    reportAnomalies: false,
    storageMethod: 'cookie', // anything other than 'cookie' will default to 'local'
    storeAsBase64: true,    
    touchpoints: {
      last: {
        enabled: true,
        expires: [30, 'minutes'],
      },
      first: {
        enabled: true,
        expires: [400, 'days'],
      },
    },
  };

  #paramsByNamespace = {
    utm: [
      'source',
      'medium',
      'campaign',
      'term',
      'content',
      'id',
      'source_platform', 
      'marketing_tactic', 
      'creative_format', 
    ],
    // This is a temp key, it gets replaced with the namespace (e.g. lvl) on init
    $ns: [
      'platform',
      'source',
      'campaign',
      'group',
      'unit',
      'extension',
      'loc_interest',
      'loc_physical',
      'device',
      'matchtype',
      'placement',
      'position',
      'target',
      'network',
    ],
  };

  #paramsExpected = {
    utm: ['source', 'medium', 'campaign'],
    $ns: ['platform', 'source'],
  };

  #referrer = null;
  #sessions = null;

  params = null;

  /**
   * This is a factory method that returns an object with the grab and fillFormFields methods.
   * The only reason this exists is for compatibility with Google Tag Managers, sandboxed JS 
   * "callInWindow" method, which can only call functions that are properties of an object.
   * GTM's sandboxed JS doens't support native ES6 classes (stupid - I know).
   */
  static create(config = {}, globalName = null)
  {
    const instance = new CampaignCollector(config);

    if (globalName && ! window.hasOwnProperty(globalName))
      window[globalName] = instance;

    return [
      'collect',
      'fillFormFields',
    ].reduce((acc, key) => {
      acc[key] = instance[key].bind(instance);
      return acc;
    }, {});
  }

  constructor(config = {}) 
  {
    console.time(this.#_libraryName);

    this.url = new URL(window.location.href);
    this.#config = this.#deepMerge(this.#defaults, config);
    this.#setFieldMap();
    this.#resolveCookieDomain();

    //this.userAgent = navigator.userAgent;
    //this.screen = [window.screen.width, window.screen.height];
    //this.device = this.#parseUserAgent();

    this.#setReferrer();
    this.#setParamAllowList();
    this.#setParams(['utm', this.#config.namespace]);

    this.#sessions = this.#storageGetAll();
    this.#maybeUpdateSession();
    
    this.#bindListeners();

    if (window.dataLayer) {
      window.dataLayer.push({ 
        event: 'lvl.campaign-collector:ready', 
        campaign: this.collect({
          applyFilters: true,
          jarCookies: true,
          without: ['globals']
        }) 
      });
    }

    console.timeEnd(this.#_libraryName);
  }

  fillFormFields(settings = {})
  {
    if (settings.hasOwnProperty('targetMethod'))
      settings.targetMethod = Array.isArray(settings.targetMethod) ? settings.targetMethod : [settings.targetMethod];

    const query = {
      targetMethod: settings.targetMethod || this.config.fieldTargetMethod,
      scope: settings.scope || document
    };

    const data = {
      //_params: this.params,
      first: this.#sessions.first,
      last: this.#sessions.last,
      //cookies: this.getCookieValues(),
      //globals: this.getGlobalValues()
    };

    for (let key in this.#config.fieldMap) {

      if (! this.#config.fieldMap.hasOwnProperty(key)) 
        continue;

      for (let prop in this.#config.fieldMap[key]) {

        if (! this.#config.fieldMap[key].hasOwnProperty(prop)) 
          continue;

        let fields;
        let field = this.#config.fieldMap[key][prop];
        let querySelector = [];

        query.targetMethod.forEach((method) => {

          const selectors = {
            class: 'input.' + field,
            parentClass: '.' + field + ' input',
            dataAttribute: 'input[' + this.#config.fieldDataAttribute + '="' + field + '"]',
            name: 'input[name="' + field + '"]'
          };

          querySelector.push(selectors[method] || selectors.name);

        });

        fields = query.scope.querySelectorAll(querySelector.join(','));

        if (!fields)
          continue;
        
        for (var i = 0; i < fields.length; i++) {
          if (data[key].hasOwnProperty(prop) && data[key][prop] != '') {
            fields[i].value = data[key][prop];
            fields[i].dispatchEvent(new Event('input', { bubbles: true }));
          }
        }

      }

    }

  }

  get activeSession()
  {
    const session = this.#sessions.last;

    if (! session)
      return null;

    if (session._expires_at < Date.now())
      return null;

    return this.#sessions.last;
  }
  
  collect({
    jarCookies = false,
    applyFilters = false,
    without = []
  } = {})
  {
    const output = {};

    if (! without.includes('params'))
      output.params = this.params;

    if (! without.includes('globals'))
      output.globals = this.#collectGlobals({ applyFilters });

    if (! without.includes('cookies'))
      output.cookies = this.#collectCookies({ applyFilters, inJars: jarCookies });

    return output;
  }

  #bindListeners()
  {
    const handleBeforeSubmit = (e) => {
      if (! e.target.matches('[type="submit"]'))
        return;
        
      this.fillFormFields(e.target.closest('form'));
    };

    if (this.#config.enableSpaSupport) {
      this.#monkeyPatchHistory();

      const handleSpaNavigation = (e) => {
        this.#setReferrer(true);
        //this.updateSession();
      };

      window.addEventListener('popstate', handleSpaNavigation);
      window.onpopstate = history.onpushstate = handleSpaNavigation;
    }

    document.addEventListener('touchstart', handleBeforeSubmit);
    document.addEventListener('mousedown', handleBeforeSubmit);
  }

  #checkExpectedParams(namespace)
  {
    const params = this.params[namespace];

    if (! Object.keys(params).length)
      return;

    const expected = this.#paramsExpected[namespace];

    for (const param of expected) {
      if (params.hasOwnProperty(param))
        continue;
      
      //this.#reportAnomaly(`Missing expected parameter "${param}" in namespace "${namespace}"`);
      return false;
    }

    return true;
  }

  #collectCookies({
    applyFilters = false,
    inJars = false
  } = {})
  {
    let cookies = {};

    if (! this.#config.fieldMap.cookies)
      return cookies;
    
    for (const [cookieName, field] of Object.entries(this.#config.fieldMap.cookies)) {

      let value = this.#getCookie(cookieName);

      if (applyFilters && typeof this.#config.filters[cookieName] === 'function') {
        try {
          value = this.#config.filters[cookieName](value);
        } catch (e) {
          console.error(
            `${this.#_libraryName}.js: Error applying filter to cookie "${cookieName}"`,
            e.message
          );
        }
      }

      if (! value)
        continue;

      if (inJars) {
        
        let isStray = true;

        for (const jar in this.#config.jars) {
          if (! new RegExp(this.#config.jars[jar]).test(cookieName))
            continue;
            
          cookies[jar] ??= {};

          cookies[jar][cookieName] = value;
          isStray = false;

          break;
        }

        if (isStray) {
          cookies._stray ??= {};
          cookies._stray[cookieName] = value;
        }

      } else {
        cookies[cookieName] = value;
      }
      
    }
    
    return cookies;
  }

  #collectGlobals({
    applyFilters = false
  } = {}) 
  {
    let globals = {};
    
    for (const [path, field] of Object.entries(this.#config.fieldMap.globals)) {

      try{
        let value = this.#resolveGlobal(path);

        if (applyFilters && typeof this.#config.filters[path] === 'function')
          value = this.#config.filters[path](value);

        globals[path] = value;
      } catch(e){
        console.error(
          `${this.#_libraryName}.js: Error resolving global "${path}"`,
          e.message
        );
      }
      
    }
    
    return globals;
  }

  #deepMerge(target, source) 
  {
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (Array.isArray(source[key])) {
          target[key] = source[key].slice();
        } else if (typeof source[key] === 'object' && source[key] !== null) {
          if (!target[key]) {
            target[key] = {};
          }
          this.#deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
    return target;
  }

  #getCookie(name)
  {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2].trim() : null;
  }

  #convertToMilliseconds({
    value = 0,
    units = 'minutes'
  } = {})
  {
    const SECONDS_PER = {
      minutes: 60,
      hours: 60 * 60,
      days: 60 * 60 * 24,
      weeks: 60 * 60 * 24 * 7,
      months: 60 * 60 * 24 * 30,
      years: 60 * 60 * 24 * 365,
    };
  
    const secondsPerUnit = SECONDS_PER[units.toLowerCase()];

    if (! secondsPerUnit) 
      return 0;
  
    return parseInt(value) * secondsPerUnit * 1000;
  }

  #monkeyPatchHistory() 
  {
    console.warn(`${this.#_libraryName}.js: config.enableSpaSupport = true monkeypatches the the history.pushState() method.`)

    let pushState = history.pushState;

    history.pushState = function(state) {
      
      if (typeof history.onpushstate == 'function') {
        history.onpushstate({
          state: state
        });
      }
      
      return pushState.apply(history, arguments);
    };
  }

  #parseReferrer()
  {
    let parsed = {};

    // If the referrer hostname is empty or is the on same root domain as the cookieDomain then we can only assume its direct
    // @CONSIDER: use referral exclusion config parameter if cross-site
    if (! this.#referrer || (this.#referrer.hostname.indexOf(this.#config.cookieDomain) > -1)) 
      return parsed;

    parsed = {
      source: this.#referrer.hostname,
      medium: 'referral'
    };
    
    for (const [medium, rules] of Object.entries(this.#config.parseRules)) {
      
      for (const [source, pattern] of Object.entries(rules)) {
    
        if (! this.#referrer.hostname.match(pattern))
          continue;
          
        parsed.source = source;
        parsed.medium = medium;
      
        break;
        
      }
      
      if (Object.keys(rules).indexOf(parsed.medium) > -1)
        break;
      
    }
    
    return parsed;
  }

  #parseUserAgent() 
  {
    const mobileMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    const isMobile = mobileMatch.test(this.userAgent);
  
    if (! isMobile)
      return "c";

    const tabletMatch = /Tablet|iPad/i;
    const isTablet = tabletMatch.test(this.userAgent);
  
    if (isTablet)
      return "t";
  
    const [h, w] = this.screen;
    const min = Math.min(w, h);
    const max = Math.max(w, h);
  
    // These thresholds can be adjusted based on your needs
    if (min >= 768 || max >= 1024)
      return "t";
  
    return "m";
  }

  #resolveCookieDomain() 
  {
    if (this.#config.cookieDomain) 
      return;

    const hostname = this.url.hostname;

    if (hostname === 'localhost')
      return '';

    const domainParts = hostname.split('.').reverse();

    // Handle TLDs with two segments (e.g., co.uk)
    let rootDomain = [domainParts[1], domainParts[0]].join('.');

    if (domainParts.length > 2 && domainParts[1].length <= 3)
      rootDomain = [domainParts[2], rootDomain].join('.');

    this.#config.cookieDomain = rootDomain;
  }

  #resolveGlobal(path) 
  {
    return path.split('.').reduce((prev, curr) => {
      return prev ? prev[curr] : null
    }, window);
  }

  #setFieldMap()
  {
    const fieldMap = this.#config.fieldMap;

    for (const [key, map] of Object.entries(fieldMap)) {
      
      if (! ['first', 'last'].includes(key))
        continue;

      for (const [namespace, fields] of Object.entries(map)) {

        let defaults = {};

        // Set default values for each field in the namespace
        this.#paramsByNamespace[namespace].forEach(field => {
          
          let ns = namespace === '$ns' ? this.#config.namespace : namespace;
          defaults[field] = `${ns}_${field}`;

          if (key == 'first')
            defaults[field] += '_1st';

        });

        let map = this.#deepMerge(defaults, fields);
        
        if (namespace === '$ns') {
          this.#config.fieldMap[key][this.#config.namespace] = map;
          delete this.#config.fieldMap[key][namespace];
        } else {
          this.#config.fieldMap[key][namespace] = map;
        }

      }

    }
  }

  #setParamAllowList()
  {
    let allowed = this.#paramsByNamespace.$ns;
    let expected = this.#paramsExpected.$ns;

    this.#paramsByNamespace[this.#config.namespace] = allowed;
    this.#paramsExpected[this.#config.namespace] = expected;

    delete this.#paramsByNamespace.$ns;
    delete this.#paramsExpected.$ns;
  }

  #setParams(namespaces = []) 
  {
    const params = this.url.searchParams;
    let data = {};

    namespaces = namespaces.length > 0 ? namespaces : [this.#config.namespace];
  
    for (const namespace of namespaces)
      data[namespace] = {};
  
    const remainderKey = 'stray';
    data[remainderKey] = {};

    if (! params) {
      this.params = data;
      return;
    }
  
    for (const [key, value] of params.entries()) {
      let matched = false;
  
      for (const namespace of namespaces) {
        if (key.startsWith(namespace + '_')) {
          const newKey = key.slice(namespace.length + 1);
          
          if (this.#paramsByNamespace[namespace].includes(newKey)) {
            data[namespace][newKey] = value;
            matched = true;
          }
          
          break;
        }
      }
  
      if (! matched) 
        data[remainderKey][key] = value;
    }
  
    this.params = data;
  }

  #setReferrer(clear = false)
  {
    let referrer;

    if (clear) {
      referrer = null;
    } else {
      referrer = document.referrer ? new URL(document.referrer) : null;
    }

    this.#referrer = referrer;
  }

  #storageGetAll()
  {
    let data = {};

    const touchpoints = this.#config.touchpoints;

    for (const [touchpoint, config] of Object.entries(touchpoints)) {

      if (! config.enabled)
        continue;
      
      let storageKey = `_${this.#config.namespace}-session-${touchpoint}`;
      data[touchpoint] = this.#storageGet(storageKey);
      
      if (data[touchpoint]?._expires_at < Date.now()) {
        this.#storageRemove(storageKey);
        data[touchpoint] = null;
      }

    }

    return data;
  }

  #storageGet(touchpoint)
  {
    const key = `_${this.#config.namespace}-session-${touchpoint}`;
    let value = this.#config.storageMethod === 'cookie' ? this.#getCookie(key) : localStorage.getItem(key);
    
    if (value && value.startsWith('base64:'))
      value = atob(value.split(':')[1]);

    value = JSON.parse(value);

    return value;
  }

  #storageRemove(touchpoint)
  {
    const key = `${this.#config.namespace}-session-${touchpoint}`;
    return this.#config.storageMethod === 'cookie' ? document.cookie = `${key}=; max-age=0; path=/; domain=${this.#config.cookieDomain}` : localStorage.removeItem(key);
  }

  #storageSet(touchpoint, value)
  {
    const key = `_${this.#config.namespace}-session-${touchpoint}`;
    const now = Date.now();

    if (! value._started_at)
      value._started_at = now;

    const [expiresIn, units] = this.#config.touchpoints[touchpoint].expires;
    value._expires_at = now + this.#convertToMilliseconds({
      value: expiresIn,
      units
    });

    value = JSON.stringify(value);

    if (this.#config.storeAsBase64)
      value = `base64:${btoa(value)}`;
    
    return this.#config.storageMethod === 'cookie' ? document.cookie = `${key}=${value}; max-age=${value._expires_at}; path=/; domain=${this.#config.cookieDomain}; secure` : localStorage.setItem(key, value);
  }

  #maybeUpdateSession()
  {
    /**
     * Heirarchy of session data:
     * 1. Defaults to (direct)/(none) to match GA4 defaults. 
     * 2. Referrer parsing can never overwrite an active session w/ explicit campaign data.
     * 3. If medium = email (or loosely matches email) and an active session exists w/ explicit campaign data -- it will be ignored.
     *    Most of the time if an active session is present, the user was explicitly told to check their email for a link (e.g. password reset or gated content delivered via email).
     * 4. If the session is the first touch - the last touch data should be set to the current parsed data.
     */

    const $ns = this.#config.namespace;

    const data = {
      utm: {
        source: '(direct)',
        medium: '(none)'
      }
    };

    data[$ns] = {};

    this.#paramsByNamespace.utm.forEach((parameter) => {
      if (['source', 'medium'].includes(parameter))
        return;

      data.utm[parameter] = null;
    });

    this.#paramsByNamespace[$ns].forEach((parameter) => {
      data[$ns][parameter] = null;
    });

    let referrer = {};

    const hasExpectedUtms = this.#checkExpectedParams('utm');
    const hasExpectedCustom = this.#checkExpectedParams($ns);

    if (! hasExpectedUtms && ! hasExpectedCustom) {

      // referrer = this.#hasActiveSession() ? {} : this.#parseReferrer();

    } else {
      if (hasExpectedUtms)
        Object.assign(data.utm, this.params.utm);
  
      if (hasExpectedCustom)
        Object.assign(data[$ns], this.params[$ns]);
    }

    Object.assign(data, referrer);

    if (this.#sessions.first) {
      // If the last touch session cookie has expired - or if the current parsed session source is not direct - the last touch session 
      // cookie should be set to the latest parsed data.
      // Otherwise the existing last touch data will be persisted until the next non-direct source is encountered.
      data = (! this.#sessions.last || (data.utm.source !== '(direct)')) ? data : this.#sessions.last;
    } else {
      // With ITP and other cookie limitations - this cookie will often be capped to 7 days.
      // See: https://www.cookiestatus.com for latest info.
      // @TODO: Implement 1st party endpoint for Safari ITP 2.3+ to extend the session window.
      this.#sessions.first = data;
      this.#storageSet('first', data);
    }
  
    this.#sessions.last = data;

    // The last touch cookie should always be refreshed to ensure the session window is extended like in UA. 
    this.#storageSet('last', data);
  }
}