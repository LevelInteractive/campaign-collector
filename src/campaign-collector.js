export default class CampaignCollector
{
  #_libraryName = 'CampaignCollector';

  /**
   * The configuration object.
   * This object is a deep merge of the default configuration settings and the user-defined configuration settings.
   * 
   * @type {Object}
   */
  #config = null;

  /**
   * Default configuration settings.
   * These settings can be customized by passing a config object to the constructor or the `create` factory method.
   * 
   * @type {Object}
   */
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

  /**
   * A list of parameters that are allowed to be stored in the session data.
   * The `utm` namespace is reserved for UTM parameters, and the `$ns` namespace is reserved for custom parameters.
   * This protects the session data (& structure) from getting out of control with unwanted or unexpected data.
   * 
   * @type {Object}
   */
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
      //'position',  // Position
      'target',    // Target
      'network',   // Network
      'device',    // Device
      'matchtype', // Match Type
      'placement', // Placement
    ],
  };

  /**
   * A list of expected parameters for each namespace.
   * Used for session update logic and anomaly detection.
   * 
   * @type {Object}
   */
  #paramsExpected = {
    utm: ['source', 'medium', 'campaign'],
    $ns: ['platform', 'campaign', 'group', 'ad'],
  };

  /**
   * Stores the referrer URL as a URL object.
   * 
   * @type {URL|null}
   */
  #referrer = null;

  /**
   * The session data object.
   * Contains the first and last touchpoint data.
   * 
   * @type {Object}
   */
  #sessions = null;

  /**
   * A list of touchpoints and their expiration times.
   * This object will be used for any future "touchpoint" configuration options.
   * 
   * @type {Object}
   */
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
   * 
   * DO NOT USE THIS OUTSIDE A GTM TEMPLATE CONTEXT.
   * 
   * @param {Object} config - The configuration object for the instance being created.
   * @param {string} globalName - The global variable (e.g. window) to assign the instance to.
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

  /**
   * Returns the active session data.
   * 
   * @returns {Object|null}
   */
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

  /**
   * Fills form inputs with campaign data based on the config `fieldMap`, and `fieldTargetMethod`.
   * Accepts an optional settings parameter to override the default config values `fieldTargetMethod` , and `scope`.
   * 
   * @param {Object} settings
   * @param {Array|string} settings.targetMethod - The method to use to select the input elements. Default: `name`.
   * @param {Element} settings.scope - The DOM node/element scope to search for input elements when using `.querySelectorAll()`. Default: `document`.
   * 
   * @returns {void}
   */
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

  /**
   * Returns the campaign data object.
   * 
   * @param {Object} settings
   * @param {boolean} settings.applyFilters - Whether to apply the filters defined in the config. Default: `false`.
   * @param {Array} settings.without - An array of keys to exclude from the output. Default: `[]`.
   * @param {boolean} settings.asJson - Whether to return the output as a JSON string. Default: `false`.
   * 
   * @returns {Object|string}
   */
  grab({
    applyFilters = false,
    asJson = false,
    without = [],
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

    return asJson ? JSON.stringify(output) : output;
  }

  /**
   * Binds event listeners to the document to handle input field population and session hydration, and history state changes.
   * 
   * @returns {void}
   */
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


  /**
   * Checks if the expected parameters are present for a given parameter namespace.
   * 
   * @param {string} namespace - The namespace to check for expected parameters.
   * @returns {boolean}
   */
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

  /**
   * Collects cookies based on the `fieldMap.cookies` configuration.
   * 
   * @param {Object} settings
   * @param {boolean} settings.applyFilters - Whether to apply the filters defined in the config. Default: `false`.
   * @returns {Object}
   */
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

  /**
   * Resolves & collects global variables based on the `fieldMap.globals` configuration.
   * 
   * @param {Object} settings
   * @param {boolean} settings.applyFilters - Whether to apply the filters defined in the config. Default: `false`.
   * @returns {Object}
   */
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

  /**
   * Deep copies an object using JSON serialization.
   * 
   * @param obj - The object to deep copy.
   * @returns {Object}
   */
  #deepCopy(obj)
  {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Deep merges two objects.
   * 
   * @param {Object} target - The target object to merge into.
   * @param {Object} source - The source object to merge from.
   * @returns {Object}
   */
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

  /**
   * Flattens an object into a single level object.
   * 
   * @param {*} obj - The object to flatten.
   * @param {*} prefix - The prefix to prepend to the keys.
   * @returns {Object}
   */
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

  /**
   * Makes a CSS selector string based on one or more target methods and a selector string.
   * 
   * @param {Array} methods - The target methods to use to select the input elements.
   * @param {string} selector - The selector string to use to add specificity to the target method.
   * @returns {string}
   */
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

  /**
   * Gets a cookie value by name.
   * 
   * @param {string} name - The name of the cookie to get.
   * @returns {string|null}
   */
  #getCookie(name)
  {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2].trim() : null;
  }

  /**
   * Gets the number of seconds for a given value and unit.
   * 
   * @param {Object} settings
   * @param {number} settings.value - The value to convert to seconds.
   * @param {string} settings.units - The unit of time to convert to seconds.
   * 
   * @returns {integer}
   */
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

  /**
   * Handles the session data update logic.
   * 1. Defaults to (direct)/(none) to match GA4 defaults. 
   * 2. Referrer parsing can never overwrite an active session w/ explicit campaign data.
   * 3. If medium = email (or loosely matches email) and an active session exists w/ explicit campaign data -- it will be ignored.
   * 4. If the session is the first touch - the last touch data should be set to reference the first touch data.
   *
   * @returns {void}
   */
  #maybeUpdateSession()
  {
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

  /**
   * Monkeypatches the history.pushState() method to handle SPA navigation.
   * This method is only called if the `config.enableSpaSupport` is set to `true`.
   * 
   * @returns {void}
   */
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

  /**
   * Parses the referrer URL and returns the source and medium based on the `config.parseRules` configuration.
   * 
   * @returns {Object}
   */
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

  /**
   * Extracts the domain from the current hostname and sets it as `config.cookieDomain` if not already set in the config.
   * 
   * @returns {void}
   */
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

  /**
   * Resolves a global variable by a dot-notation path.
   * 
   * @param {string} path - The dot-notation path to the global variable.
   * @returns {*}
   */
  #resolveGlobal(path) 
  {
    return path.split('.').reduce((prev, curr) => {
      return prev ? prev[curr] : null
    }, window);
  }

  /**
   * Sanitizes a string value by trimming, truncating, and removing unwanted characters.
   * 
   * @param {string} value - The string value to sanitize.
   * @returns {string}
   */
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

  /**
   * Gets all session data for all touchpoints in the private `#touchpoints` class property.
   * 
   * @returns {Object}
   */
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

  /**
   * Merges the default `config.fieldMap` values with the instance-defined `config.fieldMap` values.
   * 
   * @returns {void}
   */
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

  /**
   * Sets the allowed parameters for the custom parameter namespace.
   * 
   * @returns {void}
   */
  #setParamAllowList()
  {
    let allowed = this.#paramAllowList.$ns;
    let expected = this.#paramsExpected.$ns;

    this.#paramAllowList[this.#config.namespace] = allowed;
    this.#paramsExpected[this.#config.namespace] = expected;

    delete this.#paramAllowList.$ns;
    delete this.#paramsExpected.$ns;
  }

  /**
   * Sets the class `#params` property as an object of parameters grouped by namespace as the key.
   * 
   * @param {Array} namespaces - The namespaces to set the query parameters for.
   * @returns {void}
   */
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

  /**
   * Sets the referrer URL as a URL object in the private `#referrer` class property.
   * 
   * @param {boolean} clear - Whether to clear the referrer. Default: `false`.
   * @returns {void}
   */
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

  /**
   * Manually ends a session by removing the session cookie or localStorage item.
   * 
   * @param {string} touchpoint - The touchpoint to end the session for.
   * @returns {void}
   */
  #sessionEnd(touchpoint)
  {
    const key = this.#storageKey(touchpoint);
    
    if (this.#config.storageMethod === 'cookie') {
      document.cookie = `${key}=; max-age=0; path=/; domain=${this.#config.cookieDomain}`;
    } else { 
      localStorage.removeItem(key); 
    }
  }

  /**
   * Retrieves & decodes a session value from storage by touchpoint.
   * 
   * @param {string} touchpoint - The touchpoint to get the session value for.
   * @returns {Object|null}
   */
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

  /**
   * Hydrates (e.g. extends lifespan) of the session data for the last touchpoint.
   * 
   * @returns {void}
   */
  #sessionHydrate()
  {
    let value = this.#sessionGet('last');

    if (! value)
      return;

    this.#sessionSet('last', value);
  }

  /**
   * Sets & encodes a session value in storage by touchpoint.
   * Also responsible for setting the session start/end timestamps in the storage object.
   * 
   * @param {string} touchpoint - The touchpoint to set the session value for.
   * @param {Object} value - The session data to set.
   * @returns {void}
   */
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

  /**
   * Gets the storage key by touchpoint.
   * 
   * @param {string} touchpoint 
   * @returns {string}
   */
  #storageKey(touchpoint)
  {
    return `_lvl_cc_${touchpoint}`;
  }  
}