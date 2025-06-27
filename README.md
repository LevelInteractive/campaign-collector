# CampaignCollector

[![GZip size](https://img.badgesize.io/levelinteractive/campaign-collector/main/dist/core.min.js?compression=gzip)](https://github.com/levelinteractive/campaign-collector/blob/main/dist/core.min.js)

CampaignCollector is a small utility library that allows you to easily collect campaign parameters (`utm_` +) from a URL and store/persist them in browser storage. This is useful for integrating campaign data with lead generation forms and CRMs.

> [!IMPORTANT]
> This library does not send data to any analytics platform or 3rd party service by default. It is up to the implementor to decide how any collected data is used.

**Features**

- Natively supports all [9 standard campaign parameters](#standard-parameters) (e.g. `utm_*`).
- Supports storage of [17 custom parameters](#custom-parameters) with a defined prefix/namespace. 
- Ability to define [field mappings](#fieldmap) for each parameter to attach data to form submissions.
- Define 1st party cookies and global variables to capture and map along side your in-url campaign parameters.

> [!NOTE]
> This library is a port/rewrite of [Attributor.js](https://github.com/derekcavaliero/attributor/). \
> CampaignCollector offers more flexibility with its API than Attributor.js, and has been re-written with a modern Javascript footprint, and mulitple deployment/implementation options.

### Installation Options

#### Google Tag Manager (Easiest)

For Google Tag Manager users - this is the preferred and easiest deployment method.

Install the [Campaign Collector tag template](https://tagmanager.google.com/gallery/#/owners/LevelInteractive/templates/campaign-collector-gtm) from the community gallery. You can [view the tag template repository here](https://github.com/levelinteractive/campaign-collector-gtm).

This method is also suggested for data-privacy compliance. This library is configured to react to changes in Google Consent Mode and will change the data that is caputred and/or stored based on the consent state of the user.

#### Vanilla Javascript Loader

In the event you need to have more control over the logic of when the library is loaded - you can use the following async loader to mount an instance.

This most often will apply to users using a different TMS like Adobe Launch, or those who are not using a TMS at all.

```javascript
(function(l,o,a,d,e,r){
e=o.createElement(a);e.onload=d;e.defer=1;
e.src="https://cdn.jsdelivr.net/gh/levelinteractive/campaign-collector@latest/dist/core.min.js";
r=o.getElementsByTagName(a)[0];r.parentNode.insertBefore(e,r);
})(window, document, 'script', function() {

  // Initialize an instance
  window._CampaignData = new CampaignCollector();

});
```

#### NPM

> [!IMPORTANT]
> The package has not yet been released to NPM - but be at a later date.

### Supported Campaign Parameters

#### Standard Parameters

Google has defined a set of standard UTM parameters that are widely supported across advertising/martech platforms. These parameters are natively supported by the library.

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`
- `utm_id`
- `utm_marketing_tactic`
- `utm_creative_format`
- `utm_source_platform`

#### Custom Parameters

In addition to the standard parameters - this library offers flexibility for a set list of custom parameters. By default, the library will look for any parameter that starts with specific namespace (`lvl` by default). The namespace/prefix can be customized by setting the `namespace` config option to a different value. These parameters align closely with major advertising platform URL macros (e.g. Google Ads "ValueTrack" and similar). 

- `lvl_platform`
- `lvl_source`
- `lvl_campaign_name`
- `lvl_campaign`
- `lvl_group`
- `lvl_ad`
- `lvl_creative`
- `lvl_feed`
- `lvl_product`
- `lvl_extension`
- `lvl_geo_int`
- `lvl_geo_phy`
- `lvl_device`
- `lvl_matchtype`
- `lvl_placement`
- `lvl_network`
- `lvl_target`

> [!NOTE]
> The custom parameters are not extendable at this time, we may offer that capability in future versions - but there are no current plans to do so.

### Session Logic

The library uses a timeout-based session approach to store the "last" touch campaign data. This is similar to how Google Analytics functions (but not exact). 

- An active session with explicit campaign data cannot be overwritten by referrer parsing.
- On a users first visit, the `first` and `last` touch data will be the same.
- Sessions expire after 30 minutes of inactivity (unless customized via `sessionTimeout` in the config). "Inactivity" is defined as no page views, or generic click events on the page.
- First touch data can/will be misleading for browsers that cap cookie expiration at 7 days (e.g. Safari). This can be mitigated (to an extent) by rewriting the `_lvl_cc_first` cookie via a 1st party service - but will require infrastructure not provided by this library.

**Scenario A:**

1. A "first time visitor" enters the site on a page with `?utm_source=google&utm_medium=cpc&utm_campaign=helloworld` in the URL.
2. A new session is started, and the `first` and `last` touch data is set to the above parameters.
3. (10 Minutes Pass) The user opens a new tab in Google/Bing and searches your brand, then clicks on an organic result.
4. A new session is NOT started -- because the active session has explicit campaign data. The existing session is extended an additional 30 minutes.
5. (> 30 Minutes Pass) The user sees an organic social media post and clicks a link to your site.
6. A new session IS started, and the `last` touch data is set to the explicit campaign data in the URL (if present) -OR- the referrer is parsed to implicitly set a source/medium.

### Configuration Properties

#### `cookieDomain`

The domain to set 1st party cookies on. If `null`, the cookies will be set on the current root domain. If a string, the cookie will be set on the specified domain. Default: `null`.

#### `decorateHostnames`

An array of hostnames to decorate with stored campaign data to support cross-domain persistence. When set, clicks on links will automatically be decorated. Default: `[]`.

#### `enableSpaSupport`

When set to `true`, the library will monkeyPatch the `history.pushState` method to ensure that stored campaign data is hydrated to extend the session on SPA navigation. Default: `false`.

#### `fieldMap`

An object that defines field mappings for each storage group and its individual parameters. This fieldMap object is used for filling data into form inputs, as well as defining what `cookies` and `globals` to pull into the stored campaign data when running the `fill()` or `grab()` methods.

There are 4 supported storage groups: `first`, `last`, `cookies`, and `globals`. The `first` and `last` groups store the campaign data from URL parameters. These two groups have `utm` and `$ns` objects inside them - `$ns` being a reference to the defined `namespace` config option. 

By default, the library will automatically generate a fieldMap for the `first` and `last` storage groups using sensible defaults. `last` will assume a field selector that exactly matches the parameter name (e.g. `utm_source`) -- while `first` will assume a field selector that matches the parameter name with a suffix of `_1st` (e.g. `utm_source_1st`).

**A few important notes about the `fieldMap` object:**

- Custom fieldMap objects are merged with the default fieldMap object. This means you only need to configure the fields you want to override.
- The structure is `storageKey`: `fieldSelector` pairs. Where `fieldSelector` is a string that will be used to create a CSS selector using whatever means you defined in the `fieldTargetMethod` configuration option.

**Example `fieldMap` Object:**

```json
{
  "anonymous_id": "my_anon_id",
  "attribution": "my_attribution_json",
  "consent": "my_consent_json",
  "last": {
    "utm": {
      "source": "utm_source__c",
    },
    "$ns": {
      "matchtype": "matchtype__c",
    }
  },
  "cookies": {
    "_fbp": "meta__fbp",
    "_fbc": "meta__fbc",
  },
  "globals": {
    "location.href": "conversion_url",
  }
}
```

The above example defines a custom `fieldMap` for to take the last touch `utm_source`, and `lvl_matchtype` and map it to a field with a `name` attributes of `utm_source__c`, and `matchtype__c`. It instructs the library to grab the `_fbp` and `_fbc` cookies and map them to fields with `name` attributes of `meta__fbp` and `meta__fbc` respectively. Lastly, the `globals` object defines values to grab from the `window` object and map to fields with a `name` attribute of `conversion_url`.

`anonymous_id`, `attribution`, and `consent` are special keys that are simple key:value pairs. `anonymous_id` is a string that represents the key to use for the anonymous ID cookie. `attribution` and `consent` are strings that represent the keys to use for the attribution and consent JSON string values sent into separate fields if desired.

#### `fieldTargetMethod`

An array of strings that define the method used to target form fields. This allows for flexibility for form field markup variety. Valid values are: `name`, `class`, `parentClass`, and `dataAttribute`. Default: `['name']`.

**Example Field Targeting Markup:**

```html
<!-- "name" -->
<input type="hidden" name="{{fieldSelector}}">

<!-- "class" -->
<input type="hidden" class="{{fieldSelector}}">

<!-- "parentClass" -->
<div class="{{fieldSelector}}">
  <input type="hidden">
</div>

<!-- "dataAttribute" -->
<input type="hidden" data-campaign-collector="{{fieldSelector}}">
```

#### `filters`

An object that defines filters to apply values for `cookies` and `globals` objects. This is useful for transforming data before it is filled into form fields. The object is structured as `storageKey`: `function` pairs. The function should accept a single argument (the value to be transformed) and return the transformed value.

### Public API Methods

#### `fill(options)`

Use `.fill()` to manually set form field values from stored campaign data. Accepts an `options` object with the following properties:

#### `grab(options)`

Use `.grab()` to retrieve a JSON object of all stored campaign data. Accepts an `options` object with the following properties:

- `without` (array) - An array of keys to exclude from the returned object. Allowed values: 
  - `first` - Excludes last/current session data.
  - `last` - Excludes first/original session data.
  - `cookies` - Excludes 1st party cookies
  - `globals` - Excludes global variables
- `applyFilters` (boolean) - If `true`, will apply any defined filters to the returned `cookies` and `globals` objects. Default: `false`.
- `dereference` (boolean) - If `true`, any `_ref` properties in the `first` and `last` session touchpoints will be expanded. Default: `false`.
- `asJson` (boolean) - If `true`, returned data will be a JSON string and not an object literal.
