export default class CampaignCollector
{
  #_libraryName = 'CampaignCollector';
  #_libraryVersion = '1.0.0';

  #anonymousId;

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
    consent: {
      ad_personalization: null,
      ad_storage: null,
      ad_user_data: null,
      analytics_storage: null,
    },
    debug: false,
    decorateHostnames: [],
    enableSpaSupport: false,
    fieldMap: {
      anonymous_id: '$ns_anonymous_id',
      json: '$ns_attribution_json',
      consent: '$ns_consent_json',
      first: {
        utm: null,
        $ns: null,
      },
      last: {
        utm: null,
        $ns: null,
      },
      cookies: {},
      globals: {},
    },
    fieldTargetMethod: ['name'],
    fieldDataAttribute: 'data-campaign-collector',
    filters: {},
    firstPartyLeadEndpoint: null,
    firstPartyCookieEndpoint: null,
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
        instagram: '(instagram)\.com$',
        linkedin: '^www\.(linkedin)\.com$',
        tiktok: '^www\.(tiktok)\.com$',
        snapchat: '^www\.(snapchat)\.com$',
        x: '^t\.co|x\.com$',
        pinterest: '^www\.(pinterest)\.com$',
        reddit: '^www\.(reddit)\.com$',
        quora: '^www\.(quora)\.com$',
      }
    },
    plugins: [],
    sdk: null,
    sessionTimeout: null,
    storageDomain: null,
    storageMethod: 'cookie', // anything other than 'cookie' will default to 'local'
    storageNamespace: 'cc',
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
      'campaign_name', // Campaign Name
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

  #pluginAllowList = [
    'onetrust',
    'cookiebot',
  ];

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
      expires: [400, 'days'],
    },
    last: {
      expires: [30, 'minutes'],
    }
  };

  #url;

  constructor(config = {})
  {
    console.time(this.#_libraryName);

    this.#url = new URL(window.location.href);
    this.#config = this.#deepMerge(this.#defaults, config);

    this.#asyncLoadPlugins();
    
    this.#setNamespace();
    this.#setFieldMap();

    this.#resolveStorageDomain();

    this.#setAnonymousId();

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
        event: 'campaign-collector:ready', 
        campaign: this.grab({
          applyFilters: true,
          without: ['globals']
        }) 
      });
    }

    if (this.#config.debug)
      console.log(this.#config);

    console.timeEnd(this.#_libraryName);
  }

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
      'lead',
      'updateConsent'
    ].reduce((acc, key) => {
      acc[key] = instance[key].bind(instance);
      return acc;
    }, {});
  }

  #asyncLoadPlugins()
  {
    this.#config.plugins.forEach(plugin => {
      if (! this.#pluginAllowList.includes(plugin))
        return;



      // load a plugin async via script tag


    
    });
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

    // This ensures that we don't return an expired session stored in memory.
    if (session._exp < now) {
      this.#sessionEnd('last');
      this.#maybeUpdateSession();
    }

    if (session._ref) {
      const reference = this.#sessionGet(session._ref);

      if (! reference)
        return session;

      session[this.#config.namespace] = reference[this.#config.namespace];
      session.utm = reference.utm;
    }

    return session;
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
      without: ['params'],
      dereference: true
    });

    ['first', 'last'].forEach(touchpoint => {

      if (fieldMap[touchpoint])
        fieldMap[touchpoint] = this.#flattenObject(fieldMap[touchpoint]);

      if (data[touchpoint])
        data[touchpoint] = this.#flattenObject(data[touchpoint]);

    });

    for (const [group, fields] of Object.entries(fieldMap)) {

      if (typeof fields === 'string') {

        let selectorString = fields.replace('$ns', this.#config.storageNamespace);
        const inputs = query.scope.querySelectorAll(this.#makeSelectorString(query.targetMethod, selectorString));

        if (inputs) {

          const values = {
            anonymous_id: this.#anonymousId,
            consent: JSON.stringify(this.#config.consent),
            json: this.grab({
              asJson: true,
              without: ['params']
            }),
          };

          Array.from(inputs).forEach(input => {
            input.value = values[group];
            input.setAttribute('value', values[group]);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });

        }
        
        continue;
      }

      for (const [key, selector] of Object.entries(fields)) {

        const inputs = query.scope.querySelectorAll(this.#makeSelectorString(query.targetMethod, selector));

        if (! inputs?.length) 
          continue;

        let value = data[group][key] ?? '-';

        if (['cookies', 'globals'].includes(group))
          value = this.#applyFilter(this.#config.filters[key], value);

        Array.from(inputs).forEach(input => {
          input.value = value;
          input.setAttribute('value', value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
    }
  }

  #setAnonymousId() 
  {
    const storageName = `_${this.#config.storageNamespace}_anonymous_id`;
    this.#anonymousId = this.#getCookie(storageName);

    if (! this.#anonymousId)
      this.#anonymousId = `CC.1.${Date.now()}.${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;

    if (this.#config.storageMethod === 'cookie') {
      document.cookie = `${storageName}=${this.#anonymousId}; max-age=${this.#getSecondsFor({value: 400, units: 'days'})}; path=/; domain=${this.#config.storageDomain}; secure`;
    } else { 
      localStorage.setItem(storageName, this.#anonymousId);
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
    dereference = false,
    without = [],
  } = {})
  {
    const output = {
      namespace: this.#config.namespace,
    };

    if (! without.includes('anonymous_id'))
      output.anonymous_id = this.#anonymousId;

    if (! without.includes('params'))
      output.params = this.#params;

    if (! without.includes('first'))
      output.first = this.#sessions.first;

    if (! without.includes('last')) {
      output.last = this.#sessions.last;

      if (dereference && this.#sessions.last._ref)
        output.last = Object.assign(this.#sessions[this.#sessions.last._ref], output.last);
    }

    if (! without.includes('globals'))
      output.globals = this.#collectGlobals({ applyFilters });

    if (! without.includes('cookies'))
      output.cookies = this.#collectCookies({ applyFilters });

    return asJson ? JSON.stringify(output) : output;
  }

  async #sha256(value) 
  {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  }

  /**
   * Sends a base 64 encoded JSON payload to a 1st party defined endpoint.
   * Properties and User Data object keys must be in snake_case format (or they'll be thrown out).
   * @param {*} properties 
   * @param {*} userData 
   */
  lead(properties = {}, userData = {})
  {
    if (! this.#config.firstPartyLeadEndpoint)
      throw new Error('`firstPartyLeadEndpoint` is required to send lead payload.');

    let payload = {
      anonymous_id: this.#anonymousId,
      sent_at: new Date().getTime(),
      event: 'lead',
      context: {
        attribution: this.grab({
          without: ['anonymous_id', 'params', 'globals']
        }),
        locale: navigator.language,
        page: {
          title: document.title,
          url: location.href,
        },
        screen: {
          width: screen.width,
          height: screen.height,
          inner_width: innerWidth,
          inner_height: innerHeight,
        },
        sdk: `${this.#_libraryName}@${this.#_libraryVersion}`,
        user_agent: navigator.userAgent,
      },
    };

    if (this.#config.sdk)
      payload.context.sdk += `/${this.#config.sdk}`;

    // Consent @todo

    // Properties

    // Remove any properties that are not in snake_case via regex match
    Object.keys(properties).forEach(key => {
      if (! /^[a-z_]+$/.test(key)) {
        console.warn(`${this.#_libraryName}.js: Removing "${key}" from lead payload. Keys must be in snake_case format.`);
        delete properties[key];
      }
    });

    // Whatever remains are sent as custom properties
    if (Object.keys(properties).length > 0)
      payload.properties = properties;
    
    // User Data
    [
      'first_name',
      'last_name',
      'email',
      'phone',
      'city',
      'region',
      'postal_code',
      'country',
    ].forEach(field => {
      if (! userData[field]) 
        return;

      if (! payload.hasOwnProperty('user'))
        payload.user = {};

      payload.user[field] = userData[field].trim().toLowerCase();

      delete userData[field];
    });

    this.#send(`https://${this.#config.firstPartyLeadEndpoint}`, payload);
  }

  async #send(endpoint, payload)
  {
    if (payload.user) {
      const willHash = [
        'first_name',
        'last_name',
        'email',
        'phone',
        'city',
        'postal_code',
        'date_of_birth',
        'gender',
      ];

      // Exractions
      const extracted = {};

      const transforms = {
        first_name: (value) => value.replace(/[^a-z]/g, ''),
        last_name: (value) => value.replace(/[^a-z]/g, ''),
        email: (value) => {
          extracted.email_domain = value.split('@')[1];
          return value;
        },
        phone: (value) => {
          value = value.replace(/[^0-9]/g, '');

          // We don't care about non-US phone numbers
          if (value.length < 10 || value.length > 11)
            return null;

          if (value[0] !== '1' && value.length === 11)
            return null;

          value = value.length === 10 ? `1${value}` : `${value}`;

          extracted.phone_area_code = value.substring(1, 3);

          return [
            value,
            `+${value}`,
          ];
        },
        city: (value) => value.replace(/[^a-z]/g, ''),
        postal_code: (value) => value.replace(/[^0-9]/g, '').substring(0, 5),
        date_of_birth: (value) => {
          const date = new Date(value);
          // calculate age
          const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;
          payload.user.age = `${Math.floor((new Date() - date) / MS_PER_YEAR)}`;
          return date.toISOString().split('T')[0].replace('-', '');
        },
        gender: (value) => value.substring(0, 1),
      };
      
      const processedEntries = await Promise.all(
        Object.entries(payload.user)
          .map(async ([field, value]) => {
            
            if (! value) 
              return null;

            let processedValue = transforms[field] ? transforms[field](value) : value;

            if (! processedValue) 
              return null;

            if (Array.isArray(processedValue)) {
              const hashedArray = await Promise.all(
                processedValue.map(async v => willHash.includes(field) ? await this.#sha256(v) : v)
              );
              // Only return if we have valid values in the array
              return hashedArray.some(v => v) ? [field, hashedArray] : null;
            } else {
              const hashedValue = willHash.includes(field) ? await this.#sha256(processedValue) : processedValue;
              return hashedValue ? [field, hashedValue] : null;
            }
          })
      );

      // Filter out null entries and create new user object
      const validEntries = processedEntries.filter(entry => entry !== null);
      if (validEntries.length > 0) {
        payload.user = Object.assign(Object.fromEntries(validEntries), extracted);
      } else {
        payload.user = {};
      }

    }

    fetch(endpoint, {
      method: 'POST',
      body: btoa(JSON.stringify(payload)),
      keepalive: true,
    });
    
    // navigator.sendBeacon(endpoint, btoa(JSON.stringify(payload)));
  }

  /**
   * Binds event listeners to the document to handle input field population and session hydration, and history state changes.
   * 
   * @returns {void}
   */
  #bindListeners()
  {
    if (this.#config.enableSpaSupport) {
      this.#monkeyPatchHistory();

      const handleSpaNavigation = (e) => {
        this.#setReferrer(true);
        this.#maybeUpdateSession();
      };

      window.addEventListener('popstate', handleSpaNavigation);
      window.onpopstate = history.onpushstate = handleSpaNavigation;
    }

    const deferredFill = (e) => {
      // if (! e.target.matches('[type="submit"]'))
      //   return;

      const form = e.target.closest('form');

      if (! form)
        return;
        
      this.fill(form);

    };

    ['mousedown', 'touchstart'].forEach((event) => {
      document.addEventListener(event, (e) => {
        deferredFill(e);
        this.#sessionHydrate();
      });
    });
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

  #applyFilter(filter, value)
  {
    if (typeof filter !== 'function')
      return value;

    try {
      value = filter(value);
    } catch (e) {
      console.error(
        `${this.#_libraryName}.js: Error applying filter.`,
        e.message
      );
    }

    return value;
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

      if (applyFilters) 
        value = this.#applyFilter(this.#config.filters[cookieName], value);

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

        if (applyFilters)
          value = this.#applyFilter(this.#config.filters[path], value);

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
      // console.log('first touchpoint exists');
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
        _ref: 'first',
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

    // If the referrer hostname is empty or is the on same root domain as the storageDomain then we can only assume its direct
    // @CONSIDER: use referral exclusion config parameter if cross-site
    if (! this.#referrer || (this.#referrer.hostname.indexOf(this.#config.storageDomain) > -1)) 
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
        parsed.medium = `${medium}`;
      
        break;
        
      }
      
      if (Object.keys(rules).indexOf(parsed.medium) > -1)
        break;
      
    }
    
    return parsed;
  }

  /**
   * Extracts the domain from the current hostname and sets it as `config.storageDomain` if not already set in the config.
   * 
   * @returns {void}
   */
  #resolveStorageDomain()
  {
    if (this.#config.storageDomain) 
      return;

    const hostname = this.#url.hostname;

    if (hostname === 'localhost')
      return '';

    const domainParts = hostname.split('.').reverse();

    // Handle TLDs with two segments (e.g., co.uk)
    let rootDomain = [domainParts[1], domainParts[0]].join('.');

    if (domainParts.length > 2 && domainParts[1].length <= 3)
      rootDomain = [domainParts[2], rootDomain].join('.');

    this.#config.storageDomain = rootDomain;
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
      
      if (this.#config.storageMethod !== 'cookie' && data[touchpoint]?._exp < now) {
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
    const params = this.#url.searchParams;
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

    this.#sessions[touchpoint] = null;
    
    if (this.#config.storageMethod === 'cookie') {
      document.cookie = `${key}=; max-age=0; path=/; domain=${this.#config.storageDomain}`;
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
    
    if (value.startsWith('$:'))
      value = atob(value.split(':')[1]);

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

    if (! value._set)
      value._set = now;

    const [expiresIn, units] = this.#touchpoints[touchpoint].expires;

    const maxAge = this.#getSecondsFor({
      value: expiresIn,
      units
    });

    value._exp = maxAge + now;

    this.#sessions[touchpoint] = value;

    value = JSON.stringify(value);    

    if (this.#config.storeAsBase64)
      value = `$:${btoa(value)}`;
    
    const key = this.#storageKey(touchpoint);

    if (this.#config.storageMethod === 'cookie') {
      document.cookie = `${key}=${value}; max-age=${maxAge}; path=/; domain=${this.#config.storageDomain}; secure`;
    } else { 
      localStorage.setItem(key, value);
    }
  }

  #setNamespace()
  {
    let fallback = 'lvl';
    let custom = this.#config.namespace.toLowerCase().trim();
    
    if (custom == fallback)
      return;

    const checks = [
      (/[a-z]{2,4}/.test(custom)),
      (custom !== 'utm'),
    ];

    if (checks.includes(false)) {
      console.warn(`Invalid namespace: Defaulting to "lvl".`);
      this.#config.namespace = fallback;
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
    return `_${this.#config.storageNamespace}_${touchpoint}`;
  }  

  updateConsent(key, value)
  {
    if (! this.#defaults.consent.hasOwnProperty(key))
      throw new Error(`Invalid consent key: "${key}". Allowed keys are "${Object.keys(this.#defaults.consent).join('", "')}".`);

    const allowedValues = ['granted', 'denied', null];

    if (! allowedValues.includes(value))
      throw new Error('Invalid consent value. Allowed values are "granted", "denied", or null.');

    this.#config.consent[key] = value ? value.toLowerCase() : null;

    console.log(this.#config.consent);
  }
}