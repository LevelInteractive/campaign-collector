export default class CampaignCollector
{
  #_libraryName = 'CampaignCollector';
  #_libraryVersion = '1.2.0';

  #anonymousId;

  /**
   * The configuration object.
   * This object is a deep merge of the default configuration settings and the user-defined configuration settings.
   * 
   * @type {Object}
   */
  #config = null;

  /**
   * A modified URL object that is used to store the current URL without custom namespaced parameters.
   * This value is pushed to the dataLayer when the library is initialized - can be useful for overriding the default URL collected
   * by analytics platforms like GA4 to reduce URL cardinality.
   * 
   * @type {String}
   */
  #cleanUrl = null;

  /**
   * Default configuration settings.
   * These settings can be customized by passing a config object to the constructor or the `create` factory method.
   * 
   * @type {Object}
   */
  #defaults = {
    consent: {
      ad_personalization: {
        status: null, 
        redacts: []
      },
      ad_storage: {
        status: null, 
        redacts: []
      },
      ad_user_data: {
        status: null, 
        redacts: []
      },
      analytics_storage: {
        status: null,
        redacts: []
      },
    },
    debug: false,
    decorateHostnames: [],
    enableSpaSupport: false,
    fieldMap: {
      anonymous_id: '$ns_anonymous_id',
      attribution: '$ns_attribution_json',
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
    fillOnLoad: true,
    filters: {},
    firstPartyLeadEndpoint: null,
    firstPartyCookieEndpoint: null,
    namespace: 'lvl',
    nullValue: '-',
    paramMap: null,
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
      ai: {
        /**
         * Note -- Grok, DeepSeek, and Nova do not pass a referrer as of 2025-05-20
         */
        chatgpt: '(chatgpt)\.com$',
        gemini: '^(gemini)\.google\.com$',
        claude: '\.(claude)\.ai$',
        perplexity: '\.(perplexity)\.ai$',
        mistral: '\.(mistral)\.ai$',
        copilot: '^(copilot)\.microsoft\.com$',
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
    sdk: null,
    sessionTimeout: null,
    storageDomain: null,
    storageMethod: 'cookie', // anything other than 'cookie' will default to 'local'
    storageNamespace: 'cc',
    storeAsBase64: true,
    stripUtmsFromInternalLinks: false,
    userDataHash: {
      // Allows for graceful overrides of the default user data hashing behavior.
      // However, the following keys will ALWAYS be hashed: first_name, last_name, email, phone, gender, date_of_birth
      // The following user location values are sometimes used as reporting dimensions so these are "opt-in", for hashing. 
      // This setting only matters if you have the tag configured to send data to a 1st party endpoint.
      city: false,
      region: false,
      postal_code: false,
      country: false,
    },
  };

  #params = null;

  /**
   * Anything that isn't a natively supported UTM parameter is considered an "extended" parameter.
   * This allows us to possibly allow customization of them in the future.
   * 
   * @type {Array}
   */
  #customParamList = [
    'group',     // Set/Group ID
    'ad',        // Ad ID
    'product',   // Product ID
    'feed',      // Feed Item ID
    'creative',  // Creative ID
    'extension', // Extension
    'geo_int',   // Location (Interest)
    'geo_phy',   // Location (Physical)
    'target',    // Target
    'network',   // Network
    'device',    // Device
    'matchtype', // Match Type
    'placement', // Placement
  ];

  /**
   * A list of parameters that are allowed to be stored in the session data.
   * The `utm` namespace is reserved for UTM parameters, and the `$ns` namespace is reserved for custom parameters.
   * This protects the session data (& structure) from getting out of control with unwanted or unexpected data.
   * 
   * @type {Object}
   */
  #paramAllowList = {
    utm: [
      ...[
        // Natively supported and documented UTM parameters
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
      ...this.#customParamList
    ],
    hsa: [
      'cam',
      'grp',
      'ad',
      'kw',
      'tgt',
      'net',
      'mt',
      'src',
    ],
    // $ns gets replaced with the this.#config.namespace on init
    $ns: [
      ...[
        'platform',  // Platform
        'source',    // Source
        'campaign_name', // Campaign Name
        'campaign',  // Campaign ID
      ],
      ...this.#customParamList
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
    $ns: ['campaign', 'group', 'ad'],
  };

  #redacted = '(redacted)';

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

  /**
   * The URL object that is used to store the current URL.
   * 
   * @type {URL}
   */
  #url;

  constructor(config = {})
  {
    if (! CampaignCollector.canRun())
      return;

    console.time(this.#_libraryName);

    this.#url = new URL(window.location.href);
    this.#config = this.#deepMerge(this.#defaults, config);

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

    if (this.#config.fillOnLoad)
      this.fill();

    this.#bindListeners();

    this.#dataLayerPush('ready', {
      clean_url: this.#setCleanUrl(),
      config: this.#config,
    });

    console.timeEnd(this.#_libraryName);
  }

  static canRun() {
    return typeof WeakMap !== 'undefined' && 
           typeof URL !== 'undefined' && 
           typeof localStorage !== 'undefined' &&
           typeof DOMParser !== 'undefined';
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
    if (! CampaignCollector.canRun())
      return;

    const instance = new CampaignCollector(config);

    window._campaignCollector = window._campaignCollector || {};

    if (globalName && ! window._campaignCollector.hasOwnProperty(globalName))
      window._campaignCollector[globalName] = instance;

    return [
      'fill',
      'grab',
      'lead',
    ].reduce((acc, key) => {
      acc[key] = instance[key].bind(instance);
      return acc;
    }, {});
  }

  static consentChange(type, status)
  {
    if (! [
      'ad_storage',
      'ad_user_data',
      'analytics_storage',
      'ad_personalization'
    ].includes(type))
      throw new Error('Consent type invalid');

    if (! [
      'granted', 
      'denied', 
      null
    ].includes(status))
      throw new Error('Consent status must be "granted", "denied", or null');

    const ns = 'campaign-collector';

    // Generic event for all consent changes.
    document.dispatchEvent(
      new CustomEvent(`${ns}:consent.change`, {
        detail: {
          type,
          status
        },
        bubbles: true 
      })
    );

    // Specific events for each consent type for easier use.
    // e.g. campaign-collector:ad_storage.denied 
    document.dispatchEvent(
      new Event(`${ns}:${type}.${status}`, {
        bubbles: true 
      })
    );
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

    // If session is expired, just return null instead of triggering an update
    if (session._exp < now)
      return null;

    // If this is a reference-based session, resolve the reference
    if (session._ref) {
      const reference = this.#sessionGet(session._ref);
      
      if (! reference)
        return session;

      // Create a new object instead of modifying the session
      return {
        ...session,
        [this.#config.namespace]: reference[this.#config.namespace],
        utm: reference.utm
      };
    }

    return session;
  }

  get allowedFields()
  {
    return this.#paramAllowList;
  }

  get anonymousId()
  {
    return this.#checkConsentStatus('analytics_storage') ? this.#anonymousId : this.#redacted;
  }

  #dataLayerPush(event, data = {})
  {
    dataLayer = window.dataLayer || [];

    const eventName = `${this.#toKebabCase(this.#_libraryName)}:${event}`;
    const payload = {
      event: eventName,
      _cc: data,
    };

    dataLayer.push(payload);
  }

  set debug(status = false)
  {
    status = {
      '1': true,
      'true': true,
      '0': false,
      'false': false,
    }[`${status}`] ?? false;

    this.#config.debug = status;
    this.#debug('Debug', {type: 'warn', data: (status ? '✓' : '✗')});
  }

  #debug(message, {
    type = 'log',
    data = null,
  } = {})
  {
    if (typeof console[type] !== 'function')
      return;

    if (!['error', 'warn'].includes(type) && !this.#config.debug)
      return;

    try {
      console[type](`${this.#_libraryName} -`, message, data);
    } catch(e) {}
  }

  /**
   * Fills form inputs with campaign data based on the config `fieldMap`, and `fieldTargetMethod`.
   * Accepts an optional settings parameter to override the default config values `fieldTargetMethod` , and `scope`.
   * 
   * @param {Array|string} targetMethod - The method to use to select the input elements. Default: `name`.
   * @param {Element} scope - The DOM node/element scope to search for input elements when using `.querySelectorAll()`. Default: `document`.
   * 
   * @returns {void}
   */
  fill({
    targetMethod,
    scope,
  } = {})
  {
    if (targetMethod && !Array.isArray(targetMethod))
      targetMethod = [targetMethod];

    const query = {
      targetMethod: targetMethod || this.#config.fieldTargetMethod,
      scope: scope || document
    };

    const fieldMap = this.#deepCopy(this.#config.fieldMap);

    const data = this.grab({
      without: ['params'],
      applyFilters: true,
      dereference: true
    });

    const updateInput = (input, value) => { 

      // If the input already has a value that matches the value we're trying to set, skip it.
      if (input.value && input.value === value)
        return;

      input.value = value;

      // This isn't necessary, but it helps less technical people QA by seeing the value in the HTML in dev tools.
      input.setAttribute('value', input.value); 

      // This is necessary for some form providers (like hubspot) to ensure the value is actually set.
      input.dispatchEvent(new Event('input', { bubbles: false }));
    
    };

    this.#dataLayerPush('fill', {
      data
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
            anonymous_id: this.anonymousId,
            consent: JSON.stringify(this.#getConsent()),
            attribution: this.grab({
              asJson: true,
              dereference: true,
              without: ['params']
            }),
          };

          Array.from(inputs).forEach(input => updateInput(input, values[group]));
        }

        continue;

      }

      for (const [key, selector] of Object.entries(fields)) {

        const inputs = query.scope.querySelectorAll(this.#makeSelectorString(query.targetMethod, selector));

        if (! inputs?.length) 
          continue;

        let nullValue = (['cookies', 'globals'].includes(group)) ? '' : this.#config.nullValue;

        let value = data[group][key] ?? nullValue;

        Array.from(inputs).forEach(input => updateInput(input, value));

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
    dereference = false,
    without = [],
  } = {})
  {
    const output = {
      namespace: this.#config.namespace,
    };

    if (! without.includes('anonymous_id'))
      output.anonymous_id = this.anonymousId;

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
      throw new Error('Endpoint undefined');

    let payload = {
      anonymous_id: this.anonymousId,
      sent_at: new Date().getTime(),
      transport: 'beacon',
      event: 'lead',
      consent: this.#getConsent(),
      context: {
        attribution: this.grab({
          without: ['anonymous_id', 'params', 'globals']
        }),
        locale: navigator.language,
        page: {
          title: document.title,
          url: location.href,
          referrer: document.referrer,
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
        this.#debug(`✗ "${key}" != snake_case`, {
          type: 'warn',
          data: properties[key],
        });
        delete properties[key];
      }
    });

    // Whatever remains are sent as custom properties
    if (Object.keys(properties).length > 0)
      payload.properties = properties;
    
    // User Data
    // Ensures that only the allowed fields are sent anything else is dropped.
    [
      'first_name',
      'last_name',
      'email',
      'phone',
      'city',
      'region',
      'postal_code',
      'country',
      'date_of_birth',
      'gender',
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
    try{
    
      if (payload.user) {

        const willHash = [
          ...Object.keys(this.#config.userDataHash).filter(key => this.#config.userDataHash[key]), 
          ...[
            'first_name',
            'last_name',
            'email',
            'phone',
            'date_of_birth',
            'gender',
          ]
        ];

        const extracted = {};

        const transforms = {
          first_name: (value) => value.replace(/[^a-z]/g, ''),
          last_name: (value) => value.replace(/[^a-z]/g, ''),
          email: (value) => {
            let [username, domain] = value.split('@');
            extracted.email_domain = domain;

            let values = [
              value,
            ];

            if ([
              'gmail.com',
              'googlemail.com',
            ].includes(domain)) {
              // See: https://developers.google.com/google-ads/api/docs/conversions/enhanced-conversions/web#prepare-data
              // Specifically: Remove all periods (.) that precede the domain name in gmail.com and googlemail.com email addresses.
              username = username.replace(/\./g, '');
              // Google doesn't explicitly state this - but we also remove any + characters and anything after it, as this is also ignored by Gmail.
              // Basically: foo.bar+baz@gmail.com === foobar@gmail.com
              username = username.split('+')[0];
              values.push(username + '@' + domain);
            };

            return values;
          },
          phone: (value) => {
            value = value.replace(/[^0-9]/g, '');

            // We don't care about non-US phone numbers
            if (value.length < 10 || value.length > 11)
              return null;

            if (value[0] !== '1' && value.length === 11)
              return null;

            value = value.length === 10 ? `1${value}` : `${value}`;

            const phones = [
              value,
              `+${value}`,
            ];

            extracted.phone_area_code = value.substring(1, 4);
            
            return phones;
          },
          city: (value) => value.replace(/[^a-z]/g, ''),
          postal_code: (value) => value.replace(/[^0-9]/g, '').substring(0, 5),
          date_of_birth: (value) => {
            const date = new Date(value);
            // calculate age
            const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;
            extracted.age = `${Math.floor((new Date() - date) / MS_PER_YEAR)}`;
            return date.toISOString().split('T')[0].replace('-', '');
          },
          gender: (value) => value.substring(0, 1),
        };
        
        const processedEntries = await Promise.all(
          Object.entries(payload.user)
            .map(async ([field, value]) => {
              
              if (! value) 
                return null;

              if (value.match(/^[0-9a-fA-F]{64}$/))
                return [field, value];

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

      const data = JSON.stringify(payload);
      const queued = navigator.sendBeacon(endpoint, btoa(data));

      if (queued)
        return;
        
      payload.transport = 'fetch';

      const response = await fetch(endpoint, {
        method: 'POST',
        body: btoa(data),
        keepalive: true,
      });

      if (! response.ok)
        throw new Error(`Status ${response.status}`);

    } catch(err) {
      throw new Error(`#send(): ${err.message}`);
    }
  }

  #applyFilter(filter, value)
  {
    if (typeof filter !== 'function')
      return value;

    try {
      value = filter(value);
    } catch (e) {
      this.#debug('applyFilter:', {
        type: 'error',
        data: {
          msg: e.message,
          value,
        }
      });
    }

    return value;
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

    const linkHandler = (e) => {
      const target = e.target.closest('a[href]');
      
      if (! target) 
        return;

      const url = new URL(target.href);

      if (! url.hostname.includes(this.#config.storageDomain)) {

        // If the clicked link is not on the same domain as the storage domain,
        // we'll decorate the URL with campaign data if it's in the decorateHostnames list.
        if (! this.#config.decorateHostnames.some(domain => url.hostname.includes(domain) || url.hostname === domain))
          return;

        // build a query string using the active session data. 
        // This will be used to decorate the URL with campaign data.

        const params = this.#flattenObject(this.activeSession);
        
        for (const [key, value] of Object.entries(params)) {
          if (! key.startsWith('_'))
            url.searchParams.set(key, value);
        }

        // @todo
        // We should probably append known click IDs from cookies (e.g. _fbc => fbclid) to the URL as well.
        // Likely don't need it for Google (because Google does this via its conversion linker, but other platforms might).

      } else if (this.#config.stripUtmsFromInternalLinks) {

        if (! url.search.includes('utm_'))
          return;

        this.#paramAllowList.utm.forEach((param) => {
          url.searchParams.delete(`utm_${param}`);
        });

      }

      target.href = url.href;
    };
    
    document.addEventListener('click', linkHandler, true);

    const debounce = (func, wait) => {
      let timeout;
      let isFirst = true;
      
      return function executedFunction(...args) {
        if (isFirst) {
          isFirst = false;
          func(...args);
          return;
        }
        
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    };

    const deferredFill = debounce((e) => {
      const form = e.target.closest('form');
      
      if (! form) 
        return;
      
      this.fill({
        scope: form,
      });
    }, 1000);

    ['mousedown', 'touchstart'].forEach((event) => {
      document.addEventListener(event, (e) => {
        deferredFill(e);
        this.#sessionHydrate();
      });
    });

    const ns = this.#toKebabCase(this.#_libraryName);

    document.addEventListener(`${ns}:consent.change`, (e) => {
      const { type, status } = e.detail;
      this.#updateConsent(type, status);
    });

    // document.addEventListener(`${ns}:ad_user_data.denied`, (e) => {
    //   console.log('ad_user_data.denied', e);
    // });

    document.addEventListener(`${ns}:analytics_storage.denied`, (e) => {
      this.#setAnonymousId();
    });

    // document.addEventListener(`${ns}:ad_personalization.denied`, (e) => {
    //   console.log('ad_personalization.denied', e);
    // });
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

    if (!this.#config.fieldMap.cookies)
      return cookies;
    
    for (const [cookieName, field] of Object.entries(this.#config.fieldMap.cookies)) {

      let value = this.#getCookie(cookieName);

      if (value) {

        if (this.#checkConsentRedactions('ad_storage', cookieName) || this.#checkConsentRedactions('analytics_storage', cookieName))
          value = this.#redacted;

        if (value !== this.#redacted && applyFilters)
          value = this.#applyFilter(this.#config.filters[cookieName], value);

      }

      value = this.#sanitizeString(value);

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

      if (! this.#checkConsentStatus('analytics_storage')) {
        if (path.startsWith('navigator') || ['screen'].includes(path)) {
          globals[path] = this.#redacted;
          continue;
        }
      }

      try{
        let value = this.#resolveGlobal(path);

        if (! value)
          continue;

        if (applyFilters)
          value = this.#applyFilter(this.#config.filters[path], value);

        value = this.#sanitizeString(value, {
          maxLength: 1024,
        });

        globals[path] = value;
      } catch(e){
        this.#debug('resolveGlobal:', {
          type: 'error',
          data: e.message
        });
      }
      
    }
    
    return globals;
  }

  #checkConsentStatus(type)
  {
    return {
      'granted': true,
      'denied': false,
      'null': true,
      null: true,
    }[this.#config.consent[type].status];
  }

  #checkConsentRedactions(type, key)
  {
    const status = this.#checkConsentStatus(type);

    if (status)
      return !status; // true means we redact - so we want to return the opposite for the status check.

    return this.#config.consent[type].redacts.includes(key);
  }

  #updateConsent(type, status)
  {
    this.#config.consent[type].status = status ? status.toLowerCase() : null;
  }

  #getConsent()
  {
    return Object.entries(this.#config.consent).reduce((result, [key, value]) => {
      result[key] = value.status;
      return result;
    }, {});
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
        class: `input.${selector}, textarea.${selector}`,
        parentClass: `.${selector} input, .${selector} textarea `,
        dataAttribute: `input[${this.#config.fieldDataAttribute}="${selector}"], textarea[${this.#config.fieldDataAttribute}="${selector}"]`,
        name: `input[name="${selector}"], textarea[name="${selector}"]`
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

  #deleteCookie(name)
  {
    document.cookie = `${name}=; max-age=0; path=/; domain=${this.#config.storageDomain}`;
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
    // First check if current session is expired and clear if needed
    const session = this.#sessions.last;
    if (session && session._exp < Math.ceil(Date.now() / 1000))
      this.#sessionEnd('last');

    const $ns = this.#config.namespace;
    
    let data = {
      utm: {
        source: '(direct)',
        medium: '(none)'
      }
    };
    
    data[$ns] = {};

    // Check for expected parameters in current request
    const hasExpectedUtms = this.#checkExpectedParams('utm');
    const hasExpectedCustom = this.#checkExpectedParams($ns);

    // If we have expected parameters in the URL, always create new session
    if (hasExpectedUtms || hasExpectedCustom) {
      if (hasExpectedUtms)
        Object.assign(data.utm, this.#params.utm);
  
      if (hasExpectedCustom)
        Object.assign(data[$ns], this.#params[$ns]);
    } else {
      // No campaign parameters in URL - check active session quality
      const activeSession = this.activeSession;
      
      // Helper function to check if a session has expected parameters
      const hasExpectedSessionParams = (session, namespace) => {
        if (! session || ! this.#paramsExpected[namespace]) 
          return false;
        
        return this.#paramsExpected[namespace].every(param => 
          session[namespace]?.[param] && 
          // For UTM, also check if it's not the default direct/none
          (!['utm'].includes(namespace) || 
            (param === 'source' && session[namespace][param] !== '(direct)') ||
            (param === 'medium' && session[namespace][param] !== '(none)')
          )
        );
      };

      // Check if active session has either complete UTM or custom parameters
      const hasQualityUtmSession = hasExpectedSessionParams(activeSession, 'utm');
      const hasQualityCustomSession = hasExpectedSessionParams(activeSession, $ns);

      if (hasQualityUtmSession || hasQualityCustomSession) {
        // Active session has required parameters - preserve it
        data = activeSession;
      } else {
        // Active session doesn't have required parameters - try referrer parsing
        Object.assign(data.utm, this.#parseReferrer());
      }
    }

    if (this.#sessions?.first) { 
      // If the last touch session cookie has expired - or if the current parsed session source is not direct - the last touch session 
      // cookie should be set to the latest parsed data.
      // Otherwise the existing last touch data will be persisted until the next non-direct source is encountered.
      data = (!this.#sessions.last || (data.utm.source !== '(direct)')) ? data : this.#sessions.last;
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
    this.#debug('monkeypatching pushState()', {
      type: 'warn'
    });

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

    const domainParts = hostname.split('.');
    this.#config.storageDomain = (domainParts.length <= 2) ? hostname : domainParts.slice(-2).join('.');
  }

  /**
   * Resolves a global variable by a dot-notation path.
   * 
   * @param {string} path - The dot-notation path to the global variable.
   * @returns {*}
   */
  #resolveGlobal(path) 
  {
    const [root, property] = path.split('.');

    if (! property)
      return root === 'window' ? null : (window[root] ?? null);

    return [root, property].reduce((prev, curr) => {
      return prev ? prev[curr] : null
    }, window);
  }

  /**
   * Recursively decodes a URI component until it can no longer be decoded or the maximum number of iterations is reached.
   * 
   * @param {*} input 
   * @param {*} maxIterations 
   * @returns 
   */
  #recursiveDecode(input, maxIterations = 10) 
  {
    let previousValue;
    let iterations = 0;
    
    do {
      previousValue = input;
      try {
        input = decodeURIComponent(input);
        iterations++;
      } catch(e) {
        break;
      }
    } while (previousValue !== input && iterations < maxIterations);
  
    return input;
  }

  /**
   * Sanitizes a string value by trimming, truncating, and removing unwanted characters.
   * 
   * @param {string} value - The string value to sanitize.
   * @param {Object} settings
   * @param {number} settings.maxLength - The maximum length of the sanitized string. Default: `255`.
   */
  #sanitizeString(value, {
    maxLength = 255
  } = {})
  {
    if (typeof value !== 'string' || ! value)
      return '';
    
    let sanitized = String(value).trim();

    sanitized = this.#recursiveDecode(sanitized);

    // Most efficient way to remove any HTML from a string.
    // Regex is complicated and error prone.
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitized, 'text/html');
    sanitized = doc.body.textContent || '';

    // Handle values that look like JSON differently.
    // Otherwise JSON will be malformed by further string sanitization.
    if (sanitized.startsWith('{') && sanitized.endsWith('}')) {
      try {
        sanitized = JSON.stringify(JSON.parse(sanitized));
        return sanitized;
      } catch(e) {}
    }

    // Removes dangerous characters that could be used for XSS attacks.
    // This is/was also handled by the allowlist regex below. 
    // This is an explicit removal & safeguard in case we want to expose a config setting for customizing the allowlist in the future.
    sanitized = sanitized.replace(/['"<>]/g, '');

    // Allows:
    // Alpha-Numeric + Spaces
    // : / | % . _ - @ & + ~ $ ! ; = () [ ] ? { } ,
    // Reason -- we need to account for URLs - and URLS have a fairly large set of allowed characters.
    sanitized = sanitized.replace(/[^a-zA-Z0-9_\-%.?@#&+~$!:;,=/|{}\[\]\(\) ]/g, '');

    if ((sanitized.startsWith('http') || sanitized.startsWith('/')) && sanitized.includes('?'))
      sanitized = encodeURI(sanitized);

    sanitized = sanitized.slice(0, maxLength);

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

  #setAnonymousId() 
  {
    const storageName = `_${this.#config.storageNamespace}_anonymous_id`;
    this.#anonymousId = this.#getCookie(storageName);

    if (!this.#checkConsentStatus('analytics_storage')) {
      this.#anonymousId = this.#redacted;
      this.#deleteCookie(storageName);
      return;
    } else if (! this.#anonymousId?.startsWith('CC.')) {
      this.#anonymousId = `CC.1.${Date.now()}.${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;
    }

    if (this.#config.storageMethod === 'cookie') {
      document.cookie = `${storageName}=${this.#anonymousId}; max-age=${this.#getSecondsFor({value: 400, units: 'days'})}; path=/; domain=${this.#config.storageDomain}; secure`;
    } else {
      localStorage.setItem(storageName, this.#anonymousId);
    }
  }

  /**
   * Removes noise from URL query parameters for custom namespaces.
   * 
   * @returns {String} 
   */
  #setCleanUrl()
  {
    const url = new URL(location.href);
    const params = url.searchParams;

    const toRemove = [];

    if (params) {
      for (const [key, value] of params.entries()) {
        if (key.startsWith(`${this.#config.namespace}_`) || key.startsWith('hsa_'))
          toRemove.push(key);
      }
    }

    toRemove.forEach(key => params.delete(key));

    this.#cleanUrl = url.toString();

    return this.#cleanUrl;
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

    if (this.#config.paramMap) {
     const keys = Array.from(params.keys());
      
      for (const key of keys) {
        if (!this.#config.paramMap.hasOwnProperty(key))
          continue;
          
        const value = params.get(key);

        if (! value)
          continue;

        params.set(this.#config.paramMap[key], value);
        params.delete(key);
      }
    }

    let data = {};

    namespaces = namespaces.length > 0 ? namespaces : [this.#config.namespace];

    if (this.#url.search.includes('hsa_'))
      namespaces.push('hsa');
  
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

    /**
     * HubSpot Ads (HSA) parameters
     * This block of code is responsible for parsing HSA parameters and mapping them to the correct namespaced parameters so that they can be used in the session data.
     */
    if (data.hasOwnProperty('hsa')) {

      const hsaParamMap = {
        'net': '$ns.platform',
        'src': '$ns.network',
        'cam': '$ns.campaign',
        'grp': '$ns.group',
        'ad': '$ns.ad',
        'tgt': '$ns.target',
        'mt': '$ns.matchtype',
        'kw': 'utm.term',
      };

      for (const [key, value] of Object.entries(data.hsa)) {
        if (! value || ! hsaParamMap.hasOwnProperty(key))
          continue;

        let [namespace, field] = hsaParamMap[key].split('.');

        namespace = namespace.replace('$ns', this.#config.namespace);

        if (! data[namespace].hasOwnProperty(field)) {
          data[namespace][field] = field == 'platform' ? ({
            'adwords': 'google',
            'facebook': 'meta',
          }[value] ?? value) : value;
        }
      }

      delete data.hsa;

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
      this.#debug('Bad namespace: Reverting to `lvl`', {
        type: 'warn'
      });
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

  #toKebabCase(value)
  {
    return value.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }
}