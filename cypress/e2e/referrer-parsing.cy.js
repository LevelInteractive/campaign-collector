describe('Referrer Parsing', () => {

  for (const [hostname, expectedSourceMedium] of Object.entries({
    'www.facebook.com': 'facebook/social',
    'www.google.com': 'google/organic',
    'www.google.fr': 'google/organic',
    'www.google.co.uk': 'google/organic',
    'www.yahoo.com': 'yahoo/organic',
    'www.bing.com': 'bing/organic',
    'duckduckgo.com': 'duckduckgo/organic',
    't.co': 'x/social',
    'x.com': 'x/social',
    'www.linkedin.com': 'linkedin/social',
    'www.pinterest.com': 'pinterest/social',
    'www.instagram.com': 'instagram/social',
    'www.tiktok.com': 'tiktok/social',
    'www.snapchat.com': 'snapchat/social',
    'www.reddit.com': 'reddit/social',
    'www.quora.com': 'quora/social',
  })) {
    it(`should parse referrer ${hostname} to ${expectedSourceMedium}`, () => {
      cy.visitAndInit('/', {
        onBeforeLoad: (win) => {
          Object.defineProperty(win.document, 'referrer', {
            configurable: true,
            get() { return `https://${hostname}` }
          });
        }
      });

      cy.window().then((win) => {
        const data = win.libraryInstance.grab();
        expect(`${data.first.utm.source}/${data.first.utm.medium}`).to.equal(expectedSourceMedium);
      });
    });
  }

  it('should parse non organic/social referrers to [domain]/referral', () => {
    cy.visitAndInit('/', {
      onBeforeLoad: (win) => {
        Object.defineProperty(win.document, 'referrer', {
          configurable: true,
          get() { return 'https://www.example.com' }
        });
      }
    });

    cy.window().then((win) => {
      const data = win.libraryInstance.grab();
      expect(`${data.first.utm.source}/${data.first.utm.medium}`).to.equal('www.example.com/referral');
    });
  });

  it('should parse empty referrer to (direct)/(none)', () => {
    cy.visitAndInit('/', {
      onBeforeLoad: (win) => {
        Object.defineProperty(win.document, 'referrer', {
          configurable: true,
          get() { return '' }
        });
      }
    });

    cy.window().then((win) => {
      const data = win.libraryInstance.grab();
      expect(`${data.first.utm.source}/${data.first.utm.medium}`).to.equal('(direct)/(none)');
    });
  });

  it('should parse null referrer to (direct)/(none)', () => {
    cy.visitAndInit('/', {
      onBeforeLoad: (win) => {
        Object.defineProperty(win.document, 'referrer', {
          configurable: true,
          get() { return null }
        });
      }
    });

    cy.window().then((win) => {
      const data = win.libraryInstance.grab();
      expect(`${data.first.utm.source}/${data.first.utm.medium}`).to.equal('(direct)/(none)');
    });
  });

  it('should parse undefined referrer to (direct)/(none)', () => {
    cy.visitAndInit('/', {
      onBeforeLoad: (win) => {
        Object.defineProperty(win.document, 'referrer', {
          configurable: true,
          get() { return undefined }
        });
      }
    });

    cy.window().then((win) => {
      const data = win.libraryInstance.grab();
      expect(`${data.first.utm.source}/${data.first.utm.medium}`).to.equal('(direct)/(none)');
    });
  });

});