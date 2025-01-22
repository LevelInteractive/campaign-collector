describe('Session Handling Logic', () => {

  const flattenObject = (obj, prefix = '') => {
    return Object.keys(obj).reduce((acc, key) => {
      const pre = prefix.length ? `${prefix}_` : '';
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(acc, flattenObject(obj[key], `${pre}${key}`));
      } else {
        acc[`${pre}${key}`] = obj[key];
      }
      
      return acc;
    }, {});
  };
  
  const params = {
    utm: {
      source: 'google',
      medium: 'cpc',
      campaign: 'LVL_Humble_Brag_2025',
      content: '1234567890',
      term: 'Best Digital Marketing Agencies'
    },
    lvl: {
      platform: 'google',
      source: 'demandgen',
      campaign_name: 'LVL_Humble_Brag_2025',
      campaign: '987654321',
      group: '123443211234',
      ad: '98765432124',
    }
  };

  it('library should not allow referrer to override active session', () => {

    cy.log('SCENARIO: Emulate google/cpc utm parameters');
    cy.visitAndInit('/', {
      qs: flattenObject(params.utm, 'utm'),
    });

    cy.window().then((win) => {
      const data = win.libraryInstance.grab();
      cy.log(JSON.stringify(data.last));
      expect(data.last.$ref).to.equal('first');

      for (const [key, value] of Object.entries(params.utm)) {
        expect(data.first.utm[key]).to.equal(value);
      }
    });

    cy.log('SCENARIO: Emulate facebook/social visit');
    cy.visitAndInit('/', {
      onBeforeLoad: (win) => {
        Object.defineProperty(win.document, 'referrer', {
          configurable: true,
          get() { return 'https://www.facebook.com' }
        });
      }
    });

    cy.window().then((win) => {
      const data = win.libraryInstance.grab();
      for (const [key, value] of Object.entries(params.utm)) {
        expect(data.last.utm[key]).to.equal(value);
      }
    }).then((data) => {
      cy.log(JSON.stringify(data.last));
    });

  });

  it('session should timeout', () => {

    cy.visitAndInit('/', {
      qs: flattenObject(params.utm, 'utm'),
    });

    cy.clearCookie('_lvl_cc_last');

    cy.log('Emulate google/organic visit');
    cy.visitAndInit('/', {
      onBeforeLoad: (win) => {
        Object.defineProperty(win.document, 'referrer', {
          configurable: true,
          get() { return 'https://www.google.com' }
        });
      }
    });

    cy.window().then((win) => {
      const data = win.libraryInstance.grab();
      expect(data.last.utm.source).to.equal('google');
      expect(data.last.utm.medium).to.equal('organic');
    });

  });

});