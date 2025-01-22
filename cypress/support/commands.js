Cypress.Commands.add('initLibrary', (config = {}) => {
  return cy.window().then((win) => {
    const instance = new win.CampaignCollector(config);
    win.libraryInstance = instance;
    return instance;
  });
});

Cypress.Commands.add('visitAndInit', (path = '/', options = {}) => {
  const defaultOptions = {
    qs: {},
    onBeforeLoad: undefined
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  return cy.visit(path, mergedOptions)
    .then(() => {
      cy.initLibrary({
        firstPartyUri: 'https://webhook.site'
      });
    });
});
