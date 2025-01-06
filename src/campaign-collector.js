export default class CampaignCollector
{
  #alias = 'CampaignCollector';
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
        linkedin: '^www\.(linkedin)\.com$',
        facebook: '^www\.(facebook)\.com$',
        twitter: '^t\.co$',
        instagram: '^l\.(instagram)\.com$'
      }
    },
    reportAnomalies: false,
    storageMethod: 'cookie', // anything other than 'cookie' will default to 'local'
    storeAsBase64: false,    
    touchpoints: {
      last: {
        enabled: true,
        utm: {
          expires: [30, 'minutes'],
        },
        $ns: {
          expires: [30, 'minutes'],
        },
      },
      first: {
        enabled: true,
        utm: {
          expires: [400, 'days'],
        },
        $ns: {
          expires: [400, 'days'],
        },
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
    // This is a temp key, it gets replaced with the namespace on init
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
    utm: ['source', 'medium'],
    $ns: ['platform', 'source'],
  };

  #referrer = null;
  #sessions = null;

  params = null;
  session = null;

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
      'grab',
      'fillFormFields',
    ].reduce((acc, key) => {
      acc[key] = instance[key].bind(instance);
      return acc;
    }, {});
  }

  constructor(config = {}) 
  {
    console.time(this.#alias);

    this.url = new URL(window.location.href);
    this.#config = this.#deepMerge(this.#defaults, config);
    this.#setFieldMap();
    this.#resolveCookieDomain();

    this.userAgent = navigator.userAgent;
    //this.screen = [window.screen.width, window.screen.height];
    //this.device = this.#parseUserAgent();

    this.#setReferrer();
    this.#setParamAllowList();
    this.#setParams(['utm', this.#config.namespace]);

    this.#sessions = this.#storageGetAll();   
    console.timeEnd(this.#alias);
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
      first: this.session.first,
      last: this.session.last,
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
  
  grab()
  {
    
  }

  #bindListeners()
  {
    const handleBeforeSubmit = (e) => {
      if (! e.target.matches('[type="submit"]'))
        return;
        
      this.fillFormFields(e.target.closest('form'));
    };

    if (this.#config.enableSpaSupport) {
      this.monkeyPatchHistory();

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
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    
    if (parts.length === 2) {
      const part = parts.pop().split(';').shift();
      return part;
    }

    return null;
  }

  #convertToSeconds(value = 0, units)
  {
    const conversions = {
      minutes: 60,
      hours: 3600,     // 60 * 60
      days: 86400,     // 60 * 60 * 24
      weeks: 604800,   // 60 * 60 * 24 * 7
      months: 2592000, // 60 * 60 * 24 * 30
      years: 31536000, // 60 * 60 * 24 * 365
    };

    return conversions[units] ? parseInt(value) * conversions[units] : 0;
  }

  #monkeyPatchHistory() 
  {
    console.warn(`${this.#alias}.js: config.enableSpaSupport = true monkeypatches the the history.pushState() method.`)

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
    const referrer = this.#referrer;
    let parsed = {};

    // If the referrer hostname is empty or is the on same root domain as the cookieDomain then we can only assume its direct
    // @CONSIDER: use referral exclusion config parameter if cross-site
    if (! referrer || (referrer.hostname.indexOf(this.#config.cookieDomain) > -1)) 
      return parsed;

    parsed = {
      source: referrer.hostname,
      medium: 'referral'
    };
    
    for (let medium in this.#config.parseRules) {
      
      if (!rules.hasOwnProperty(medium))
        continue;
      
      for (let source in rules[medium]) {
      
        if (!rules[medium].hasOwnProperty(source))
          continue;
      
        let check = referrer.hostname.match(rules[medium][source]);
        
        if (!check)
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
    let custom = this.#paramsByNamespace.$ns;
    this.#paramsByNamespace[this.#config.namespace] = custom;

    delete this.#paramsByNamespace.$ns;
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

    for (const touchpoint in touchpoints) {

      if (! touchpoints.hasOwnProperty(touchpoint))
        continue;

      let config = touchpoints[touchpoint];

      if (! config.enabled)
        continue;
      
      let storageKey = `${this.#config.namespace}-${touchpoint}`;
      data[touchpoint] = this.#storageGet(storageKey);
      
      if (data[touchpoint]?._expires >= Date.now()) {
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

    if (! value._timestamp)
      value._timestamp = now;

    let maxAge = this.#convertToSeconds(400, 'days');

    if (expires) {
      value._expires = now + maxAge;
      const [expires, units] = this.#config.touchpoints[touchpoint].expires;
      maxAge = this.#convertToSeconds(expires, units);
    }

    value = JSON.stringify(value);

    if (this.#config.storeAsBase64)
      value = `base64:${btoa(value)}`;
    
    return this.#config.storageMethod === 'cookie' ? document.cookie = `${key}=${value}; max-age=${maxAge}; path=/; domain=${this.#config.cookieDomain}; secure` : localStorage.setItem(key, value);
  }
}