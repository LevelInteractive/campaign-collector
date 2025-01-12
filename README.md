# Campaign Collector

[![GZip Size](https://img.badgesize.io/levelinteractive/campaign-collector/main/dist/core.min.js?compression=gzip&label=JS%20GZip%20size)](https://github.com/levelinteractive/campaign-collector/blob/main/dist/core.min.js)

> [!NOTE]
> CampaignCollector is a port/rewrite of [Attributor.js](https://github.com/derekcavaliero/attributor/). \
> This library offers more flexibility with its API than Attributor.js, and has been written to be compatible with Google Tag Managers Sandboxed Javascript restrictions.

### Overview

Campaign Collector is a small library that allows you to easily collect UTM parameters from a URL and store/persist them in browser storage. This is useful for tracking campaign data across multiple pages on a website. 

#### Features

- Natively supports all standard `utm_*` parameters.
- Supports storage of custom parameters with a defined prefix/namespace. 
- Ability to define field mappings for each parameter to attach data to form submissions.
- Define 1st party cookies and global variables to capture and map along side your in-url campaign parameters.

> [!IMPORTANT]
> This library does not send data to any analytics platform or 3rd party service. It is up to you (the implementor) to decide how to use the data.

### Installation Options

#### Google Tag Manager (Easiest)

In most cases (especially for Google Tag Manager users) - this is the preferred and easiest deployment method.

Install the [Campaign Collector tag template](https://tagmanager.google.com/gallery/#/owners/#) in the community gallery.

You can [view the tag template repository here](https://github.com/levelinteractive/campaign-collector-gtm).

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

If you are using a build process and want to include the library as a dependency - you can install it via NPM.

##### Install the Package
```bash
$ npm install campaign-collector
```

##### Import the Package
```javascript
import CampaignCollector from 'campaign-collector';

// Initialize an instance
window._CampaignData = new CampaignCollector();
```

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
> The custom parameters are not extendable at this time, we may offer that capability in future versions.

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

A few important notes about the `fieldMap` object:

- Custom fieldMap objects be merged with the default fieldMap object. This means you only need to configure the fields you want to override.
- The structure is `storageKey`: `fieldSelector` pairs. Where `fieldSelector` is a string that will be used to create a CSS selector using whatever means you defined in the `fieldTargetMethod` configuration option.

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
  - `first` - Excludes standard UTM parameters
  - `last` - Excludes custom parameters
  - `cookies` - Excludes 1st party cookies
  - `globals` - Excludes global variables
- `applyFilters` (boolean) - If `true`, will apply any defined filters to the returned `cookies` and `globals` objects. Default: `false`.