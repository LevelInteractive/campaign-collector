// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

Cypress.on('uncaught:exception', (err, runnable) => {
  // Suppress specific errors from Alpine.js or related to undefined variables
  if (err.message.includes('namespace is not defined') || err.message.includes('field is not defined')) {
    return false;
  }
});

import './commands'