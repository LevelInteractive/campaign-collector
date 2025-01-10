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
    sessionTimeout: null,
    storageMethod: 'cookie', // anything other than 'cookie' will default to 'local'
    storeAsBase64: true,
  };

  #params = null;

  #paramAllowList = {
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
    // $ns gets replaced with the this.#config.namespace on init
    $ns: [
      'platform',  // Platform
      'source',    // Source
      'campaign',  // Campaign ID
      'group',     // Set/Group ID
      'ad',        // Ad ID
      'product',   // Product ID
      'feed',      // Feed Item ID
      'creative',  // Creative ID
      'extension', // Extension
      'geo_int',   // Location (Interest)
      'geo_phy',   // Location (Physical)
      'position',  // Position
      'target',    // Target
      'network',   // Network
      'device',    // Device
      'matchtype', // Match Type
      'placement', // Placement
    ],
  };

  #paramsExpected = {
    utm: ['source', 'medium', 'campaign'],
    $ns: ['platform', 'campaign', 'group', 'ad'],
  };

  #referrer = null;
  #sessions = null;

  #touchpoints = {
    first: {
      expires: [2, 'years'],
    },
    last: {
      expires: [30, 'minutes'],
    }
  };

  /**
   * This is a factory method that returns an object with the grab and fill methods.
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
      'fill',
      'grab',
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

    this.#setReferrer();
    this.#setParamAllowList();
    this.#setParams(['utm', this.#config.namespace]);

    if (Array.isArray(this.#config.sessionTimeout))
      this.#touchpoints.last.expires = this.#config.sessionTimeout;

    this.#sessions = this.#sessionGetAll();
    this.#maybeUpdateSession();

    console.log(this.#config);

    this.fill();
    this.#bindListeners();

    if (window.dataLayer) {
      window.dataLayer.push({ 
        event: 'lvl.campaign-collector:ready', 
        campaign: this.grab({
          applyFilters: true,
          without: ['globals']
        }) 
      });
    }

    console.timeEnd(this.#_libraryName);
  }

  get activeSession()
  {
    const session = this.#sessions.last;

    if (! session)
      return null;

    const now = Math.ceil(Date.now() / 1000);

    if (session.$exp < now) {
      this.#sessions.last = null;
      this.#maybeUpdateSession();
    }

    return this.#sessions.last;
  }

  get allowedFields()
  {
    return this.#paramAllowList;
  }

  fill(settings = {})
  {
    if (settings.hasOwnProperty('targetMethod'))
      settings.targetMethod = Array.isArray(settings.targetMethod) ? settings.targetMethod : [settings.targetMethod];

    const query = {
      targetMethod: settings.targetMethod || this.#config.fieldTargetMethod,
      scope: settings.scope || document
    };

    const fieldMap = this.#deepCopy(this.#config.fieldMap);

    const data = this.grab({
      without: ['params']
    });

    ['first', 'last'].forEach(touchpoint => {

      if (fieldMap[touchpoint])
        fieldMap[touchpoint] = this.#flattenObject(fieldMap[touchpoint]);

      if (data[touchpoint])
        data[touchpoint] = this.#flattenObject(data[touchpoint]);

    });

    console.log(fieldMap);

    for (const [group, fields] of Object.entries(fieldMap)) {

      if (group === '$json') {
        continue;
      }

      for (const [key, selector] of Object.entries(fields)) {

        const inputs = query.scope.querySelectorAll(this.#makeSelectorString(query.targetMethod, selector));

        if (! inputs?.length) 
          continue;

        const value = data[group][key] ?? '-';

        Array.from(inputs).forEach(input => {
          input.value = value;
          input.setAttribute('value', value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
    }
  }

  grab({
    applyFilters = false,
    without = []
  } = {})
  {
    const output = {};

    if (! without.includes('params'))
      output.params = this.#params;

    if (! without.includes('first'))
      output.first = this.#sessions.first;

    if (! without.includes('last'))
      output.last = this.#sessions.last;

    if (! without.includes('globals'))
      output.globals = this.#collectGlobals({ applyFilters });

    if (! without.includes('cookies'))
      output.cookies = this.#collectCookies({ applyFilters });

    return output;
  }

  #bindListeners()
  {
    const handleBeforeSubmit = (e) => {
      if (! e.target.matches('[type="submit"]'))
        return;

      const form = e.target.closest('form');
        
      this.fill(form);

      let data;

      form.querySelectorAll(this.#makeSelectorString(this.#config.fieldTargetMethod, this.#config.fieldMap.$json)).forEach(input => {
        data = data ?? JSON.stringify(this.grab({
          without: ['params']
        }));

        input.value = data;
      });
    };

    if (this.#config.enableSpaSupport) {
      this.#monkeyPatchHistory();

      const handleSpaNavigation = (e) => {
        this.#setReferrer(true);
        this.#maybeUpdateSession();
      };

      window.addEventListener('popstate', handleSpaNavigation);
      window.onpopstate = history.onpushstate = handleSpaNavigation;
    }

    document.addEventListener('mousedown', (e) => {
      handleBeforeSubmit(e);
      this.#sessionHydrate();
    });

    document.addEventListener('touchstart', handleBeforeSubmit); 
  }

  #checkExpectedParams(namespace)
  {
    const params = this.#params[namespace];

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
  } = {})
  {
    let cookies = {};

    if (! this.#config.fieldMap.cookies)
      return cookies;
    
    for (const [cookieName, field] of Object.entries(this.#config.fieldMap.cookies)) {

      let value = this.#getCookie(cookieName);

      if (! value)
        continue;

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

      cookies[cookieName] = value;
      
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

        if (! value)
          continue;

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

  #deepCopy(obj)
  {
    return JSON.parse(JSON.stringify(obj));
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

  #flattenObject(obj, prefix = '') 
  {
    return Object.keys(obj).reduce((acc, key) => {
      const pre = prefix.length ? `${prefix}_` : '';
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(acc, this.#flattenObject(obj[key], `${pre}${key}`));
      } else {
        acc[`${pre}${key}`] = obj[key];
      }
      
      return acc;
    }, {});
  }

  #makeSelectorString(methods = [], selector)
  {
    return methods.map(method => {

      const selectorMap = {
        class: 'input.' + selector,
        parentClass: '.' + selector + ' input',
        dataAttribute: 'input[' + this.#config.fieldDataAttribute + '="' + selector + '"]',
        name: 'input[name="' + selector + '"]'
      };

      return selectorMap[method] || selectorMap.name;

    }).join(',');
  }

  #getCookie(name)
  {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2].trim() : null;
  }

  #getSecondsFor({
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
  
    return parseInt(value) * secondsPerUnit;
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

    let data = {
      utm: {
        source: '(direct)',
        medium: '(none)'
      }
    };

    data[$ns] = {};

    const hasExpectedUtms = this.#checkExpectedParams('utm');
    const hasExpectedCustom = this.#checkExpectedParams($ns);

    if (hasExpectedUtms)
      Object.assign(data.utm, this.#params.utm);

    if (hasExpectedCustom)
      Object.assign(data[$ns], this.#params[$ns]);

    if (! hasExpectedUtms && ! hasExpectedCustom)
      Object.assign(data.utm, this.#parseReferrer());

    if (this.#sessions?.first) {
      console.log('first touchpoint exists');
      // If the last touch session cookie has expired - or if the current parsed session source is not direct - the last touch session 
      // cookie should be set to the latest parsed data.
      // Otherwise the existing last touch data will be persisted until the next non-direct source is encountered.

      data = (! this.#sessions.last || (data.utm.source !== '(direct)')) ? data : this.#sessions.last;
    } else {
      
      // With ITP and other cookie limitations - this cookie will often be capped to 7 days.
      // See: https://www.cookiestatus.com for latest info.
      // @TODO: Implement 1st party endpoint for Safari ITP 2.3+ to extend the session window.
      this.#sessions.first = data;
      this.#sessionSet('first', data);

      data = {
        $ref: 'first',
      };
    }
  
    this.#sessions.last = data;

    // The last touch cookie should always be refreshed to ensure the session window is extended like in UA. 
    this.#sessionSet('last', data);
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
      medium: '(referral)'
    };
    
    for (const [medium, rules] of Object.entries(this.#config.parseRules)) {
      
      for (const [source, pattern] of Object.entries(rules)) {
    
        if (! this.#referrer.hostname.match(pattern))
          continue;
          
        parsed.source = source;
        parsed.medium = `(${medium})`;
      
        break;
        
      }
      
      if (Object.keys(rules).indexOf(parsed.medium) > -1)
        break;
      
    }
    
    return parsed;
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

  #sanitizeString(value) 
  {
    if (! value) 
      return '';
    
    let sanitized = String(value).trim();
    sanitized = sanitized.slice(0, 255);

    // sanitized = sanitized.replace(/<[^>]*>[^<]*(<[^>]*>[^<]*)*<\/[^>]*>/g, '');
    // sanitized = sanitized.replace(/<[^>]*>/g, '');

    sanitized = sanitized.replace(/[^a-zA-Z0-9_\-%.@+~$!:=;/|\[\]\(\) ]/g, '');

    const sqlPatterns = [
      ///\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b/gi,
      /--|;/g,
      /\/\*|\*\//g
    ];

    sqlPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    return sanitized;
  }

  #sessionGetAll()
  {
    let data = {};

    const now = Math.ceil(Date.now() / 1000);

    for (const [touchpoint, config] of Object.entries(this.#touchpoints)) {

      data[touchpoint] = this.#sessionGet(touchpoint);
      
      if (this.#config.storageMethod !== 'cookie' && data[touchpoint]?.$exp < now) {
        this.#sessionEnd(touchpoint);
        data[touchpoint] = null;
      }

    }

    return data;
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
        this.#paramAllowList[namespace].forEach(field => {
          
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
    let allowed = this.#paramAllowList.$ns;
    let expected = this.#paramsExpected.$ns;

    this.#paramAllowList[this.#config.namespace] = allowed;
    this.#paramsExpected[this.#config.namespace] = expected;

    delete this.#paramAllowList.$ns;
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
      this.#params = data;
      return;
    }
  
    for (const [key, value] of params.entries()) {
      let matched = false;
  
      for (const namespace of namespaces) {
        if (key.startsWith(namespace + '_')) {
          const newKey = key.slice(namespace.length + 1);
          
          if (this.#paramAllowList[namespace].includes(newKey)) {
            data[namespace][newKey] = this.#sanitizeString(value);
            matched = true;
          }
          
          break;
        }
      }
  
      if (! matched) 
        data[remainderKey][key] = this.#sanitizeString(value);
    }
  
    this.#params = data;
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

  #sessionEnd(touchpoint)
  {
    const key = this.#storageKey(touchpoint);
    
    if (this.#config.storageMethod === 'cookie') {
      document.cookie = `${key}=; max-age=0; path=/; domain=${this.#config.cookieDomain}`;
    } else { 
      localStorage.removeItem(key); 
    }
  }

  #sessionGet(touchpoint)
  {
    const key = this.#storageKey(touchpoint);
    let value = this.#config.storageMethod === 'cookie' ? this.#getCookie(key) : localStorage.getItem(key);

    if (! value)
      return null;
    
    if (value.startsWith('64:'))
      value = atob(value.split(':')[1]);
    
    if (value.$ref)
      return this.#sessionGet(value.$ref);

    value = JSON.parse(value);

    if (value === 'null')
      value = null;

    return value;
  }

  #sessionHydrate()
  {
    let value = this.#sessionGet('last');

    if (! value)
      return;

    this.#sessionSet('last', value);
  }

  #sessionSet(touchpoint, value)
  { 
    const now = Math.ceil(Date.now() / 1000);

    if (! value.$set)
      value.$set = now;

    const [expiresIn, units] = this.#touchpoints[touchpoint].expires;

    const maxAge = this.#getSecondsFor({
      value: expiresIn,
      units
    });

    value.$exp = maxAge + now;

    value = JSON.stringify(value);

    if (this.#config.storeAsBase64)
      value = `64:${btoa(value)}`;
    
    const key = this.#storageKey(touchpoint);

    if (this.#config.storageMethod === 'cookie') {
      document.cookie = `${key}=${value}; max-age=${maxAge}; path=/; domain=${this.#config.cookieDomain}; secure`;
    } else { 
      localStorage.setItem(key, value);
    }
  }

  #storageKey(touchpoint)
  {
    return `_lvl_cc_${touchpoint}`;
  }  
}