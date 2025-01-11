# Campaign Collector

[![JS GZip Size](https://img.badgesize.io/levelinteractive/campaign-collector/main/dist/core.min.js?compression=gzip&label=JS%20GZip%20size)](https://github.com/levelinteractive/campaign-collector/blob/main/dist/core.min.js)

> [!NOTE]
> CampaignCollector is a port/rewrite of [Attributor.js](https://github.com/derekcavaliero/attributor/). \
> This library offers more flexibility with its API than Attributor.js, and has been written to be compatible with Google Tag Managers Sandboxed Javascript restrictions.

### Overview

Campaign Collector is a small library that allows you to easily collect UTM parameters from a URL and store/persist them in browser storage. This is useful for tracking campaign data across multiple pages on a website. 

#### Features

- Natively supports all standard `utm_*` parameters (source, medium, campaign, term, content, marketing_tactic, creative_format, source_platform).
- Supports storage of custom parameters with a defined prefix/namespace. 
- Ability to define field mappings for each parameter to attach data to form submissions (or other events).
- Define 1st party cookies and global variables to capture and map along side your in-url campaign parameters.

> [!IMPORTANT]
> This library does not send data to any analytics platform or 3rd party service. It is up to you (the implementor) to decide how to use the data.

### Installation Options

#### Google Tag Manager (Easiest)

Install the [Campaign Collector tag template](https://tagmanager.google.com/gallery/#/owners/#) in the community gallery.

You can [view the tag template repository here](https://github.com/levelinteractive/campaign-collector-gtm).

#### Vanilla Javascript Loader

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

##### Install the Package
```bash
npm install campaign-collector
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

In addition to the standard parameters - this library offers flexibility for a set list of custom parameters. By default, the library will look for any parameter that starts with `$ns_`. `$ns` can be customized by setting the `namespace` config option to a different value. These parameters align closely with major advertising platform URL macros (e.g. Google Ads "ValueTrack" and similar). 

- `$ns_platform`
- `$ns_source`
- `$ns_campaign_name`
- `$ns_campaign`
- `$ns_group`
- `$ns_ad`
- `$ns_creative`
- `$ns_feed`
- `$ns_product`
- `$ns_extension`
- `$ns_geo_int`
- `$ns_geo_phy`
- `$ns_device`
- `$ns_matchtype`
- `$ns_placement`
- `$ns_network`
- `$ns_target`

> [!NOTE]
> The custom parameters are not extendable at this time, we may offer that capability in future versions.