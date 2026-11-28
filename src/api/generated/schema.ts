// GENERIERT — nicht von Hand ändern.
// Quelle: src/api/generated/openapi.json (Backend: python -m scripts.api_vertrag),
// erzeugt mit: npm run api:gen (openapi-typescript). Charge N,
// docs/specs/refactoring-wachstum.md §5.
export interface paths {
    "/pwa/absences/pruefen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FerienVorpruefung"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/appointments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Termin"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/appointments/{appointment_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TerminGeaendert"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/pwa/admin/appointments/{appointment_id}/customer-notice": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Terminbestaetigung"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/eingang/{item_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AufgabeGeaendert"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/pwa/admin/ferienplanung/assistent/stand": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AssistentStand"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/ferienplanung/konten": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FerienKonten"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/ferienplanung/konten/abschluss": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Jahresabschluss"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/ferienplanung/konten/kuerzen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FerienGekuerzt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/ferienplanung/konten/{staff_id}/{jahr}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FerienKonto"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/ferienplanung/planer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FerienPlaner"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/ferienplanung/pruefen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FerienPruefung"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/ferienplanung/stammdaten": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FerienStammdaten"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/ferienplanung/{art}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FerienGespeichert"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/ferienplanung/{art}/{zeile_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FerienGespeichert"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FerienGespeichert"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/pwa/admin/filialen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FilialenListe"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FilialeGespeichert"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/filialen/{filiale_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FilialeGespeichert"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/pwa/admin/installation-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MontageVorlage"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/installation-templates/{template_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/pwa/admin/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RechnungZeile"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/anzahlungen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OffeneAnzahlungen"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/bexio-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BexioStatus"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/billable-reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["VerrechenbareRapporte"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RechnungErstellt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/generate-free": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FreieRechnungErstellt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RechnungSeite"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/pending-action": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FaelligeRechnung"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/quote-coverage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OffertenAbdeckung"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/reconcile-camt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CamtAbgleich"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/work-description": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Arbeitsbeschrieb"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/{invoice_id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/{invoice_id}/bexio-cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/{invoice_id}/mahnstopp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/{invoice_id}/mark-paid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/{invoice_id}/mark-reminder-sent": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/{invoice_id}/mark-sent": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/{invoice_id}/send-mahnung": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/{invoice_id}/send-zahlungserinnerung": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/invoices/{invoice_id}/unmark-paid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/microsoft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MsZustand"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/microsoft/adminconsent/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MsLink"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/microsoft/oauth/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MsLink"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/microsoft/versand/testmail": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/appointments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Termin"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TerminAngelegt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/kundenlink": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Kundenlink"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/kundenlink/sperren": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Kundenlink"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RapportZeile"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RapportGespeichert"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/reports/aggregate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/reports/{report_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RapportInhalt"];
                    };
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RapportGespeichert"];
                    };
                };
            };
        };
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RapportGeloescht"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/reports/{report_id}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/reports/{report_id}/dissolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/reports/{report_id}/partial": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/reports/{report_id}/pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/schedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/terminvorschlaege": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TerminVorschlaege"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/terminvorschlaege/protokoll": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/projects/{project_id}/terminwahl": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TerminwahlAnsicht"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TerminwahlAnsicht"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/querverweise": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quote-attachment-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AnhangVorlagen"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quote-attachment-templates/{template_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quote-description": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BeschreibungVorschlag"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quote-position-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PositionsVorlagen"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quote-skonto-defaults": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SkontoVorgabe"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SkontoVorgabe"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/pwa/admin/quote-travel-cost-table": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FahrspesenTabelle"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quote-validity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OffertenGueltigkeit"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OffertenGueltigkeit"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/pwa/admin/quotes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OfferteZeile"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OfferteGespeichert"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/extract-pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PdfAuszug"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OffertenSeite"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/pending-reminders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OfferteZumErinnern"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OffertenVorschau"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OfferteDetail"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OfferteGespeichert"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/add-variant": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OfferteKopiert"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/dismiss-reminder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/mark-sent": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/prospekte": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Prospekte"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/regenerate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OfferteKopiert"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/send-attachments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["VersandAnhaenge"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/send-group": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Versandgruppe"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/send-order-confirmation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/send-rejection": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/send-reminder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/send-thankyou": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/quotes/{quote_id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/schedule/absences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlanAbsenz"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/schedule/distances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Distanzen"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/schedule/meldungen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["EinsatzStaende"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/schedule/reservationen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Reservationen"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/schedule/stand": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlanStand"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/service/nachfassen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NachfassFaelle"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/service/termindauer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TerminDauerVorgaben"];
                    };
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TerminDauerVorgaben"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/special-position-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SonderVorlage"][];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/special-position-templates/{template_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/pwa/admin/spellcheck": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Rechtschreibung"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/staff/{staff_id}/files": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Personalordner"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PersonalDatei"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/staff/{staff_id}/files/{file_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/tenant/termin-farben": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TerminFarben"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/admin/terminanfragen/{anfrage_id}/zurueckziehen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/chat/staff-choice": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ChatAntwort"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/ferienplanung/kalender": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FerienKalender"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/projects/{project_id}/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MonteurRapport"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/schedule/appointments/{appointment_id}/meldung": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MeldungAnsicht"];
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MeldungAntwort"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/schedule/week": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Wochenplan"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/feed/bexio/{ref}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BexioLage"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/feed/health/anmeldungen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AnmeldeLage"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/feed/health/rapport-bot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RapportBotLage"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/health/anmeldungen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AnmeldeLage"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/health/rapport-bot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RapportBotLage"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/tenants/{tenant_id}/mail-eingang/zustaendigkeiten": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ZustaendigkeitenBetreiber"];
                    };
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ZustaendigkeitenBetreiber"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/tenants/{tenant_id}/microsoft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MsZustand"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/tenants/{tenant_id}/microsoft/link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MsLink"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/tenants/{tenant_id}/microsoft/link/entwurf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MsLinkEntwurf"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/tenants/{tenant_id}/microsoft/link/senden": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/tenants/{tenant_id}/microsoft/versand/testmail": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/tenants/{tenant_id}/microsoft/{zweck}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Erledigt"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pwa/superadmin/tenants/{tenant_id}/rapport-bot-prompt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RapportBotFachgebiet"];
                    };
                };
            };
        };
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RapportBotFachgebiet"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description Eine Zeile der Offerten-Auswahl im Erstellen-Dialog. */
        AbdeckungOfferte: {
            id: number;
            quote_number: string | null;
            total: number;
            accepted: boolean;
        };
        AbgleichSumme: {
            total: number;
            matched: number;
            amount_mismatch: number;
            already_paid: number;
            unmatched: number;
            applied: number;
            dry_run: boolean;
        };
        /** @description Eine Gutschrift aus dem Bankauszug und ihr Abgleich. */
        AbgleichZeile: {
            /** @enum {string} */
            status: "matched" | "amount_mismatch" | "already_paid" | "unmatched";
            reference: string | null;
            paid_amount: number;
            currency: string | null;
            value_date: string | null;
            debtor_name: string | null;
            invoice_id: number | null;
            invoice_number: string | null;
            project_name: string | null;
            expected_amount: number | null;
            amount_diff: number | null;
        };
        AbsenzStueck: {
            date_start: string;
            date_end: string;
        };
        Anhang: {
            id: string;
            filename: string;
        };
        /** @description Standard-Anhang für den Offerten-Versand (``quote_attachment_templates``). */
        AnhangVorlage: {
            id: string;
            filename: string;
            mime_type: string | null;
            file_size: number | null;
            created_at: string;
        };
        AnhangVorlagen: {
            attachments: components["schemas"]["AnhangVorlage"][];
        };
        AnmeldeBremse: {
            /** @description Präfix des Rate-Keys, z.B. «pw_login». */
            name: string;
            anzahl: number;
            login: boolean;
        };
        AnmeldeKonto: {
            name: string;
            mandant: string;
            rolle: string;
            art: ("passwort" | "wiederherstellung") | string;
            fehlversuche: number;
            fehlversuche_24h: number;
            /** @description Meiste Fehlversuche in einem 15-Minuten-Fenster des Zeitraums. */
            spitze_15min: number;
            letzter: string;
            /** @description Die Bremse je Konto greift in diesem Moment. */
            gesperrt: boolean;
        };
        /** @description Ampel, Tageszähler und auffällige Konten. Nicht lesbar: nur ``status`` und ``days``. */
        AnmeldeLage: {
            /** @enum {string} */
            status: "ok" | "nicht_lesbar";
            days: number;
            /** @enum {string} */
            ampel?: "gruen" | "gelb" | "rot";
            gruende?: string[];
            sperre?: components["schemas"]["AnmeldeSperre"];
            summen?: components["schemas"]["AnmeldeSummen"];
            /** @description Alt → neu, jeder Tag des Zeitraums. */
            tage?: components["schemas"]["AnmeldeTag"][];
            bremsen?: components["schemas"]["AnmeldeBremse"][];
            /** @description Höchstens 50, meiste Fehlversuche zuerst. */
            konten?: components["schemas"]["AnmeldeKonto"][];
            /** @description Mehr Zähler-Zeilen als gelesen — die ältesten Tage fehlen. */
            gekappt?: boolean;
        };
        AnmeldeSperre: {
            versuche: number;
            minuten: number;
        };
        AnmeldeSummen: {
            login_falsch: number;
            login_unbekannt: number;
            login_gesperrt: number;
            bremse_login: number;
            bremse_andere: number;
        };
        /** @description Ein Tag (Schweizer Datum) des Zeitraums, auch ohne Ereignis (dann Nullen). */
        AnmeldeTag: {
            tag: string;
            /** @description Falsches Passwort auf ein bestehendes Konto. */
            login_falsch: number;
            /** @description Benutzername gibt es nicht — Grundrauschen. */
            login_unbekannt: number;
            /** @description Abgewiesen, weil die Bremse je Konto griff. */
            login_gesperrt: number;
            /** @description Treffer der Rate-Limits rund um die Anmeldung. */
            bremse_login: number;
            /** @description Treffer der übrigen Rate-Limits (Formulare, KI, Uploads). */
            bremse_andere: number;
        };
        /** @description Vorschlag «Ausgeführte Arbeiten» (``/admin/invoices/work-description``). */
        Arbeitsbeschrieb: {
            work_description: string | null;
        };
        AssistentStand: {
            themen: components["schemas"]["AssistentThema"][];
            /** @description Offene Vorschläge (Gruppen, Sperrfristen, Regeln) mit status 'vorschlag'. */
            vorschlaege: number;
        };
        AssistentThema: {
            thema: string;
            titel: string;
            frage: string;
            /** @description 'offen', 'erledigt' oder 'uebersprungen'. */
            status: string;
            notiz: string;
        };
        /** @description ``PATCH /admin/eingang/{item_id}``: die Aufgabe der Mail ist umgestellt. */
        AufgabeGeaendert: {
            id: string;
            /** @description Schlüssel aus dem Katalog (services/eingang_zustaendigkeit.AUFGABEN). */
            aufgabe: string;
        };
        AufgabeImKatalog: {
            key: string;
            label: string;
            beschreibung: string;
        };
        AuszugPosition: {
            label: string;
            ek_price: number;
        };
        /** @description Ein Produkt aus dem Lieferanten-PDF, mit Vorschlag für Kategorie und VK. */
        AuszugProdukt: {
            name: string;
            description: string;
            quantity: number;
            unit: string;
            /** @description null = kein EK vorbelegt (manuelle Erfassung); OCR liefert immer eine Zahl. */
            ek_price: number | null;
            /** @description Griesser: Farbe des Produktblocks, sonst leer. */
            color?: string;
            positions?: components["schemas"]["AuszugPosition"][];
            suggested_category: string | null;
            suggested_margin_factor: number | null;
            suggested_vk_price: number | null;
        };
        Befund: {
            /** @description 'regel', 'sperrfrist' oder 'pflicht' (Gesetz). */
            quelle: string;
            regel_id: string | null;
            art: string;
            /** @description 'hart' oder 'weich'. */
            haerte: string;
            titel: string;
            tage: string[];
            konkurrenz: components["schemas"]["Konkurrenz"][];
            /** @description Fundstelle bei Pflichtbefunden, z.B. «OR 329c Abs. 1». */
            gesetz: string | null;
            /** @description Nur konkurrierende Anträge, nichts Genehmigtes. */
            nur_beantragt?: boolean;
            /** @description max_am_stueck: Arbeitstage des Blocks. */
            arbeitstage?: number;
            /** @description vorlauf: so viele Tage vor Ferienbeginn beantragt. */
            tage_vorher?: number;
            /** @description zwei_wochen: Tage, die für einen Block noch fehlen. */
            noetig?: number;
            /** @description zwei_wochen: Rest des Anspruchs nach diesem Antrag. */
            rest?: number;
            /** @description Mitarbeiter-App: wie viele im Weg stehen (ohne Namen). */
            anzahl_konkurrenz?: number;
        };
        /** @description Ein Konto, das den Eingang öffnen kann (§5) — nur die Betreiber-Seite sieht die Rolle. */
        BerechtigtePerson: {
            id: string;
            name: string;
            rolle: string;
        };
        /** @description «Beschreibung formulieren». */
        BeschreibungVorschlag: {
            description: string;
            /** @description false = es kam nichts Brauchbares zurück (leer oder identisch zur Eingabe); die Maske zeigt dann eine Meldung statt eines Vorschlags. */
            changed: boolean;
            /** @description Offene Punkte zum Vorschlag (fehlende Angabe, Widerspruch, Zahl, die nicht aus den Stichworten stammt). Stehen im Popup, nie im Text. */
            hints: string[];
        };
        /** @description Datum/Zeit/Art, wie sie dem Kunden gesendet wurden (Zeiten HH:MM, leer = null). */
        BestaetigungStand: {
            start_date: string | null;
            end_date: string | null;
            start_time: string | null;
            end_time: string | null;
            kind: string | null;
            label: string | null;
        };
        BetragZeile: {
            description: string;
            total_price: number;
        };
        /** @description Ein Auftrag der ``bexio_sync_queue``, neueste zuerst. */
        BexioAuftrag: {
            id: number;
            /** @description customer_upsert, invoice_issue, payment_sync, invoice_cancelled. */
            kind: string;
            /** @description Werkora-id: Kunde bei customer_upsert, sonst die Rechnung. */
            local_id: string;
            /** @description Nur bei offenen Rechnungs-Aufträgen (nicht `done`), höchstens 50 je Abruf. */
            invoice_number?: string | null;
            status: string;
            attempts: number;
            last_error: string | null;
            next_attempt_at: string | null;
            created_at: string;
            finished_at: string | null;
        };
        /** @description Zustand einer Rechnung in bexio (``services.bexio_sync.badge_states``). */
        BexioBadge: {
            /** @enum {string} */
            state: "in_bexio" | "wird_uebertragen" | "fehler" | "storniert" | "storno_offen";
            bexio_id?: number | null;
            message?: string | null;
            /** @description Nur bei `storno_offen`: der Betrieb hat bestätigt, der Lauf führt es aus. */
            confirmed?: boolean | null;
        };
        BexioLage: {
            /** @description Slug des Mandanten. */
            tenant: string;
            name: string;
            module_enabled: boolean;
            /** @description BEXIO_TOKEN_KEY gesetzt — ohne ist die Anbindung aus. */
            key_configured: boolean;
            /** @description Verbindung ohne Geheimnis und ohne lookup_ids; null = nicht eingerichtet. */
            connection: {
                [key: string]: unknown;
            } | null;
            /** @description Anrede → bexio-id, wie der Kontakt-Abgleich sie liest (lookup_ids.salutation, vom letzten Verbindungstest). */
            anreden: {
                [key: string]: unknown;
            };
            /** @description Aufträge je Status unter den gelieferten. */
            queue_counts: {
                [key: string]: number;
            };
            jobs: components["schemas"]["BexioAuftrag"][];
        };
        /** @description ``/admin/invoices/bexio-status``: Zustand je Rechnungs-id (als String). */
        BexioStatus: {
            states: {
                [key: string]: components["schemas"]["BexioBadge"];
            };
        };
        /** @description Antwort von ``POST /admin/invoices/reconcile-camt``. */
        CamtAbgleich: {
            status: string;
            summary: components["schemas"]["AbgleichSumme"];
            results: components["schemas"]["AbgleichZeile"][];
        };
        /**
         * @description Antwort eines Chat-Schritts. Die übrigen Felder (Zusammenfassung,
         *     Projekt-Auswahl, Material-Rückfrage) kommen je nach Schritt dazu.
         */
        ChatAntwort: {
            reply: string;
            action_taken: string | null;
            staff_choice?: components["schemas"]["PersonenWahl"][] | null;
        };
        /** @description Dauer in Minuten (Spanne; ohne Spanne von = bis). */
        Dauer: {
            von: number;
            bis: number;
        };
        /** @description Fahrdistanz zwischen zwei Objektadressen (kanonisch: a <= b). */
        Distanz: {
            a: string;
            b: string;
            km: number;
        };
        Distanzen: {
            distances: components["schemas"]["Distanz"][];
        };
        /**
         * @description Ein Einsatz an einem Tag (``services.schedule_export._project_for_day``). Ein
         *     mehrtägiger Termin kommt an jedem seiner Tage vor.
         */
        Einsatz: {
            /** @description Projekt-id — für den Sprung in die Projektmaske. */
            id: string;
            /** @description Termin-id; null nur bei Alt-Zeilen ohne Termin. Mit dem Tag der stabile Schlüssel: dasselbe Projekt darf zweimal am Tag stehen. */
            appointment_id: string | null;
            name: string;
            kind: string;
            is_internal: boolean;
            art_der_arbeit: string;
            /** @description Fertig beschriftet vom Server ('07:30–12:00', 'ganztägig' …), inklusive Termin-Typ — dieselbe Zeile steht so im Wochenplan-PDF. */
            time_label: string;
            termin_kind: string | null;
            termin_label: string | null;
            customer_name: string;
            object_address: string;
            billing_address: string;
            phone: string;
            local_contact_name: string;
            monteur_names: string[];
            bemerkung: string;
            is_multi_day: boolean;
        };
        /** @description ``/admin/schedule/meldungen``: Stand je Kundeneinsatz des Tages (Schlüssel: Termin-id). */
        EinsatzStaende: {
            date: string;
            meldungen: {
                [key: string]: components["schemas"]["EinsatzStand"];
            };
        };
        /** @description Stand eines Einsatzes am Tag (``einsatz_meldung_service.stand_fuer_client``). */
        EinsatzStand: {
            /** @enum {string} */
            stand: "geplant" | "unterwegs" | "vor_ort" | "erledigt";
            /** @description «HH:MM» Schweizer Zeit */
            ankunft_ca: string | null;
            unterwegs_at: string | null;
            vor_ort_at: string | null;
            /** @description Wie viele Nachrichten an den Kunden heute noch gehen (höchstens drei je Termin). */
            nachrichten_uebrig: number;
        };
        /**
         * @description Antwort einer Aktion ohne eigenen Inhalt (bezahlt, versendet, archiviert …).
         *     Weitere Felder je Route gehen als Zusatzfelder durch; Vertrag sind ``status`` und
         *     — wo die Route eine liefert — die ``message``, die der Dialog anzeigt.
         */
        Erledigt: {
            status: string;
            message?: string | null;
        };
        /**
         * @description Überfällige Rechnung (gesendet, ≥ 30 Tage offen) — Kachel im Dashboard
         *     (``/admin/invoices/pending-action``).
         */
        FaelligeRechnung: {
            id: number;
            invoice_number: string;
            project_id: string | null;
            project_name: string;
            project_id_text: string | null;
            customer_name: string | null;
            total_amount: number;
            sent_at: string | null;
            due_date: string | null;
            zahlungserinnerung_sent_at: string | null;
            mahnung_sent_at: string | null;
        };
        /**
         * @description Wirksame Fahrspesen-Staffelung: ``[[km_schwelle, chf], …]``, `null` als letzte
         *     Schwelle heisst «und darüber».
         */
        FahrspesenTabelle: {
            travel_cost_table: [
                number | null,
                number
            ][];
        };
        FerienGekuerzt: {
            status: string;
            tage: number;
            vorher: components["schemas"]["AbsenzStueck"];
            stuecke: components["schemas"]["AbsenzStueck"][];
        };
        FerienGespeichert: {
            status: string;
            zeile?: {
                [key: string]: unknown;
            };
        };
        FerienGruppe: {
            id: string;
            name: string;
            art: string;
            kriterium: string[];
            status: string;
            quelle: string;
            /** @description Aufgelöste staff_ids (dynamisch oder manuell). */
            mitglieder: string[];
        };
        /** @description Mitarbeiter-App: was für mich gilt. `wirkt` = Ferienplanung ist GA (sonst nichts anzeigen). */
        FerienKalender: {
            wirkt: boolean;
            kanton: string;
            sperrfristen: components["schemas"]["MeineSperrfrist"][];
            feiertage: string[][];
            /** @description 'bezogen' | 'geplant' | 'fehlt' (OR 329c Abs. 1). */
            zwei_wochen: string;
        };
        FerienKonten: {
            jahr: number;
            konten: components["schemas"]["FerienKonto"][];
            /** @description Übertrag/Korrektur ändern, Ferien kürzen (wer freigibt). */
            darf_bearbeiten: boolean;
            /** @description Jahresabschluss (Geschäftsleitung). */
            darf_abschliessen: boolean;
        };
        FerienKonto: {
            staff_id: string;
            name: string;
            anspruch: number;
            /** @description 'personal', 'age_50plus', 'unter_20' oder 'tenant_default'. */
            quelle: string;
            uebertrag: number;
            korrektur: number;
            bezogen: number;
            geplant: number;
            rest: number;
            notiz: string;
            abgeschlossen: boolean;
            abgeschlossen_am: string | null;
            /** @description Übertrag nach Herkunftsjahr (Jahr → Tage). */
            herkunft: {
                [key: string]: number;
            };
            /** @description Rest am Jahresende nach Herkunftsjahr. */
            herkunft_ende: {
                [key: string]: number;
            };
            hinweise: components["schemas"]["KontoHinweis"][];
        };
        FerienPerson: {
            id: string;
            name: string;
            funktion: string | null;
            projektleiter?: boolean;
            role?: string;
            kanton?: string;
            gruppen?: string[];
        };
        FerienPlaner: {
            von: string;
            bis: string;
            personen: components["schemas"]["FerienPerson"][];
            gruppen: components["schemas"]["PlanerGruppe"][];
            absenzen: components["schemas"]["PlanerAbsenz"][];
            sperrfristen: components["schemas"]["PlanerSperrfrist"][];
            /** @description Kanton → [[Datum, Name]]. */
            feiertage: {
                [key: string]: string[][];
            };
            /** @description absence_id → Befunde der offenen Anträge. */
            befunde: {
                [key: string]: components["schemas"]["Befund"][];
            };
            /** @description staff_id → Jahr → 'bezogen' | 'geplant' | 'fehlt' (OR 329c Abs. 1). */
            zwei_wochen: {
                [key: string]: {
                    [key: string]: string;
                };
            };
        };
        FerienPruefung: {
            befunde: components["schemas"]["Befund"][];
        };
        FerienRegel: {
            id: string;
            titel: string;
            art: string;
            gruppe_id: string | null;
            staff_ids: string[];
            parameter: {
                [key: string]: unknown;
            };
            haerte: string;
            gueltig_ab: string | null;
            gueltig_bis: string | null;
            status: string;
            quelle: string;
        };
        FerienStammdaten: {
            gruppen: components["schemas"]["FerienGruppe"][];
            sperrfristen: components["schemas"]["Sperrfrist"][];
            regeln: components["schemas"]["FerienRegel"][];
            personen: components["schemas"]["FerienPerson"][];
            funktionen: string[];
            vorlagen: components["schemas"]["Vorlage"][];
        };
        /** @description Vorprüfung eines Antrags in der Mitarbeiter-App — Befunde ohne Namen anderer. */
        FerienVorpruefung: {
            wirkt: boolean;
            befunde: components["schemas"]["Befund"][];
            /** @description Satz für harte Befunde. */
            meldung?: string;
        };
        Filiale: {
            id: string;
            name: string;
            /** @description Kantonskürzel — bestimmt die Feiertage der Mitarbeitenden dieser Filiale. */
            kanton: string;
            /** @description Inaktiv: gerechnet wird mit dem Kanton des Hauptsitzes. */
            aktiv: boolean;
        };
        FilialeGespeichert: {
            status: string;
            filiale: components["schemas"]["Filiale"];
        };
        FilialenListe: {
            filialen: components["schemas"]["Filiale"][];
            /** @description Kanton des Hauptsitzes (tenants.canton) — gilt ohne Filiale. */
            hauptsitz_kanton: string;
            /** @description Wählbare Kantonskürzel. */
            kantone: string[];
        };
        Fixposition: {
            item_name: string;
            amount: number;
            unit: string;
            unit_price: number;
            /** @description Herkunft aus einer Offerte — das Bearbeiten schickt sie mit zurück. */
            source_quote_id: number | null;
        };
        Foto: {
            id: string;
            filename: string;
            mime_type: string | null;
            created_at?: string | null;
        };
        /** @description Antwort von ``POST /admin/invoices/generate-free`` (Rechnung ohne Projekt). */
        FreieRechnungErstellt: {
            status: string;
            invoice_id: number;
            invoice_number: string;
            total_amount: number;
            payment_reference: string | null;
        };
        /** @description Offerte, die beim Versand zusammen mit der gewählten in EIN Mail geht (WW-34). */
        Gruppenmitglied: {
            id: number;
            label: string;
            quote_number: string;
            amount: number;
            status: string | null;
        };
        Jahresabschluss: {
            jahr: number;
            personen: number;
            uebertrag_summe: number;
        };
        Kleinmaterial: {
            item_name: string;
            count: number;
            amount_chf: number;
        };
        Konkurrenz: {
            staff_id: string;
            name: string;
            /** @description 'approved' oder 'requested' — nie der Absenz-Typ. */
            status: string;
        };
        KontoHinweis: {
            /** @description 'P1', 'P3', 'P7', 'P8', 'P9' oder 'abschluss'. */
            code: string;
            text: string;
            gesetz: string | null;
            /** @description P7: zulässige Kürzung, P8: Krankheitstage in den Ferien. */
            tage?: number;
            /** @description P8: die Ferien-Absenz, die gekürzt werden kann. */
            absence_id?: string;
        };
        Kundenlink: {
            url: string;
        };
        LohnZeile: {
            description: string;
            quantity: number;
            unit: string;
            unit_price: number;
            total_price: number;
            hidden?: boolean;
        };
        MaterialZeile: {
            description: string;
            quantity: number;
            unit: string;
            unit_price: number;
            total_price: number;
            optional?: boolean;
            /** @description Preis der Zeile VOR der Endziffern-Aufrundung (Feature werkora_bonus). Beim Bearbeiten unverändert zurückschicken — sonst kann das Backend die bonusfreie Basis nicht mehr herstellen. */
            werkora_bonus_base_unit_price?: number;
            werkora_bonus_base_total_price?: number;
        };
        MeineSperrfrist: {
            titel: string;
            art: string;
            haerte: string;
            von: string;
            bis: string;
        };
        /** @description Was das Blatt «Unterwegs» des Monteurs braucht. */
        MeldungAnsicht: {
            /** @enum {string} */
            stand: "geplant" | "unterwegs" | "vor_ort" | "erledigt";
            /** @description «HH:MM» Schweizer Zeit */
            ankunft_ca: string | null;
            unterwegs_at: string | null;
            vor_ort_at: string | null;
            /** @description Wie viele Nachrichten an den Kunden heute noch gehen (höchstens drei je Termin). */
            nachrichten_uebrig: number;
            appointment_id: string;
            /** @description Vorwahl der Ankunftszeit (nach Plan, ab dem Einsatz davor bzw. dem Depot) — oder null. */
            vorschlag: string | null;
            chips: number[];
            /** @description Hat der Auftrag eine Mail-Adresse (Kontakt vor Ort oder Kunde)? */
            kunde_erreichbar: boolean;
            telefon: string;
        };
        MeldungAntwort: {
            stand: components["schemas"]["EinsatzStand"];
            kunde_informiert: boolean;
            hinweis: string;
        };
        Mengenzeile: {
            description: string;
            quantity: number;
            unit: string;
            unit_price: number;
            total_price: number;
        };
        /** @description Montage-Vorlage (``installation_templates``). */
        MontageVorlage: {
            id: string;
            label: string;
            default_fee: number;
            notes: string | null;
            /** @description Nur in der Verwaltungsliste (`/admin/quote-position-templates`); das Offertformular bekommt die Vorlagen schon sortiert. */
            sort_order?: number;
        };
        /** @description Ein Rapport in der Projektansicht der Monteur-App (``/projects/{id}/reports``). */
        MonteurRapport: {
            id: number;
            report_date: string;
            description: string | null;
            /** @description Wer den Rapport ERFASST hat — beim nacherfassten Rapport das Büro. */
            created_by: string | null;
            signature_timestamp: string | null;
            invoice_id: number | null;
            created_at: string;
            is_partial?: boolean | null;
            is_aggregate?: boolean | null;
            merged_into_report_id?: number | null;
            dissolved_at?: string | null;
            pl_accepted_at?: string | null;
            source: string | null;
            /** @description Nur eigene Rapporte darf der Monteur löschen. */
            is_own: boolean;
            /** @description Hängt der Rapport an einer Rechnung, die der Kunde schon hat (gesendet/bezahlt)? Nur dann ist die Unterschrift endgültig gesperrt. */
            invoice_locked?: boolean;
        };
        /** @description Adresse, zu der der Browser soll (Anmeldung oder Admin-Freigabe). */
        MsLink: {
            url: string;
            gueltig_minuten: number;
        };
        /** @description ``POST …/superadmin/tenants/{id}/microsoft/link/entwurf`` — Begleitmail zum Durchlesen. */
        MsLinkEntwurf: {
            /** @description Vorbelegter Empfänger: die Adresse des Postfachs. */
            an: string;
            betreff: string;
            /** @description Kurzer Standardtext; der Platzhalter wird beim Senden zum Link. */
            text: string;
            platzhalter: string;
            /** @description Postfach des Betreiber-Mandanten, aus dem gesendet wird. */
            absender?: string | null;
        };
        /** @description Zustand einer Verbindung. Nicht verbunden: nur ``zweck``, ``verbunden``, ``status``. */
        MsVerbindung: {
            /** @enum {string} */
            zweck: "versand" | "eingang";
            verbunden: boolean;
            status: ("ok" | "getrennt") | null;
            mailbox?: string | null;
            connected_at?: string | null;
            connected_by?: string | null;
            last_ok_at?: string | null;
            last_error?: string | null;
            granted_scopes?: string[] | null;
            /** @description Rechte aus §4, die Microsoft nicht erteilt hat. */
            fehlende_rechte?: string[] | null;
        };
        /** @description ``GET /admin/microsoft`` bzw. ``…/superadmin/tenants/{id}/microsoft``. */
        MsZustand: {
            /** @description Werkora-App und MS_TOKEN_KEY sind in dieser Umgebung gesetzt. */
            eingerichtet: boolean;
            verbindungen: components["schemas"]["MsVerbindung"][];
            /** @description Vorbelegung der Adressfelder je Zweck (tenants.email, Eingangspostfach). */
            vorschlag?: {
                [key: string]: string;
            } | null;
            /** @description Hat der Mandant das Modul mail_eingang? */
            mail_eingang?: boolean | null;
            /** @description Nur Betreiber-Seite: aus welchem Postfach «Link per Mail senden» geht. */
            link_absender?: string | null;
        };
        NachfassFaelle: {
            faelle: components["schemas"]["NachfassFall"][];
        };
        /** @description Anfrage ohne Termin, die das Büro anrufen muss. */
        NachfassFall: {
            anfrage_id: string;
            project_id: string;
            /** @enum {string} */
            status: "offen" | "gewaehlt" | "keiner_passt" | "abgelaufen" | "zurueckgezogen";
            titel: string;
            hinweis_kunde: string;
        };
        /** @description Eine Anzahlungsrechnung, die eine neue Rechnung abziehen kann (WW-47). */
        OffeneAnzahlung: {
            id: number;
            invoice_number: string;
            total_amount: number;
            status: string;
            created_at: string;
            anzahlung_pct: number | null;
        };
        /** @description Anzahlungen zum Abziehen (``/admin/invoices/anzahlungen``). */
        OffeneAnzahlungen: {
            anzahlungen: components["schemas"]["OffeneAnzahlung"][];
        };
        /**
         * @description Offerte mit allen Positionen — was die Bearbeiten-Maske füllt
         *     (``/admin/quotes/{quote_id}``, die ganze Zeile aus ``quotes``).
         */
        OfferteDetail: {
            id: number;
            quote_number: string;
            project_name: string;
            project_id?: string | null;
            /** @description Kunde der Offerte — eigenständig gegenüber dem Projektkunden. Alt-Offerten haben nur den Text-Snapshot customer_name. */
            customer_id: string | null;
            customer_name: string | null;
            labor_items: components["schemas"]["LohnZeile"][];
            material_items: components["schemas"]["MaterialZeile"][];
            travel_items: components["schemas"]["BetragZeile"][];
            extra_product_items: components["schemas"]["ProduktZeile"][];
            extra_charge_items: components["schemas"]["ZuschlagZeile"][];
            installation_items: components["schemas"]["Mengenzeile"][];
            special_items: components["schemas"]["Mengenzeile"][];
            labor_discount_pct: number;
            material_discount_pct: number;
            skonto_pct: number | null;
            skonto_days: number | null;
            /** @description Fixpreis brutto inkl. MwSt; null = kein Fixpreis. */
            fixed_price: number | null;
            notes: string | null;
            product_description: string | null;
            /** @description Zeitpunkt des Versands (Mail oder «Per Post versendet»); null = nie versendet. Daran entscheidet die Maske, ob der Typ noch umstellbar ist. */
            sent_at?: string | null;
            /** @description 'offerte' | 'richtofferte' (Feature richtofferte). */
            quote_type?: string | null;
        };
        /** @description Antwort von Anlegen (``POST /admin/quotes``) und Bearbeiten (``PATCH``). */
        OfferteGespeichert: {
            total_amount: number;
            /** @description Gespeichert, aber der Fixpreis geht nicht auf (über der Kalkulation oder unter Lohn + Fahrt) — das Total ist ein anderes als der eingegebene Betrag. */
            fixed_price_missed: boolean;
        };
        /** @description Neue Variante (``…/add-variant``) oder neue Version (``…/regenerate``). */
        OfferteKopiert: {
            id: number;
            quote_number: string;
        };
        /** @description Eine Offerte in der Liste (``db.quotes.get_quotes_for_admin`` und ``…_page``). */
        OfferteZeile: {
            id: number;
            quote_number: string;
            project_name: string;
            /** @description Null bei einer freistehenden Offerte ohne Projekt. */
            project_id?: string | null;
            total_amount: number;
            status: string;
            created_at: string;
            storage_path?: string | null;
            xlsx_storage_path?: string | null;
            reminder_sent_at: string | null;
            /** @description Heutiger Projektleiter des Projekts — danach filtert die Liste. */
            projektleiter_id: string | null;
            /** @description Projektleiter beim Erstellen der Offerte (Snapshot, steht so auf dem PDF). Leer bei sehr alten Offerten; dann zeigt die Liste den heutigen. */
            projektleiter_name?: string | null;
            /** @description Text-Snapshot des Rechnungsempfängers (Kunden-Spalte, Suche). */
            customer_name?: string | null;
            customer_email?: string | null;
            thankyou_sent_at?: string | null;
            rejection_mail_sent_at?: string | null;
            order_confirmation_sent_at?: string | null;
            /** @description Trägt die Kennzeichnung «Kein Feedback» (quoteFeedback.ts). */
            sent_at?: string | null;
        };
        /**
         * @description Offerte, die seit ≥ 14 Tagen offen ist und noch keine Erinnerung hat
         *     (``/admin/quotes/pending-reminders``, Kachel im Dashboard).
         */
        OfferteZumErinnern: {
            id: number;
            quote_number: string;
            customer_name: string;
            customer_email: string;
            project_name: string;
            /** @description Zum Öffnen des Projekts aus dem Dialog; null bei einer freistehenden Offerte. */
            project_id?: string | null;
            total_amount: number;
            sent_at: string | null;
        };
        /** @description Offerten-Auswahl (``/admin/invoices/quote-coverage``). */
        OffertenAbdeckung: {
            /** @description Was die automatische Auflösung abdecken würde (Standard: angehakt). */
            covered: components["schemas"]["AbdeckungOfferte"][];
            /** @description Weitere angenommene, unverrechnete Offerten des Projekts (Standard: nicht angehakt). */
            additional: components["schemas"]["AbdeckungOfferte"][];
            /** @description Sperre der Automatik (z.B. 'all_billed') — covered ist dann leer, additional kann trotzdem wählbar sein. */
            blocker: string | null;
        };
        /** @description Gültigkeitsdauer der Offerten in Monaten; `is_default` = System-Wert. */
        OffertenGueltigkeit: {
            months: number;
            is_default: boolean;
            min: number;
            max: number;
            default: number;
        };
        /** @description Eine Seite der Offertenliste (``/admin/quotes/list``). */
        OffertenSeite: {
            rows: components["schemas"]["OfferteZeile"][];
            /** @description Alle Treffer, nicht nur die Seite. */
            total: number;
            page: number;
            page_size: number;
        };
        /** @description ``POST /admin/quotes/preview``: rechnet wie das Speichern, speichert nichts. */
        OffertenVorschau: {
            arbeit: components["schemas"]["VorschauBlock"];
            waren: components["schemas"]["VorschauBlock"];
            pauschalen: components["schemas"]["VorschauPauschalen"];
            netto: number;
            mwst: number;
            total: number;
            fixpreis: components["schemas"]["VorschauFixpreis"] | null;
            projekt_rabatt: components["schemas"]["VorschauProjektRabatt"];
            katalog_preise: components["schemas"]["VorschauKatalogPreis"][];
            marge: components["schemas"]["VorschauMarge"];
            /** @description Beim Speichern wird das Total auf die Endziffern aufgerundet; der Betrag hängt an der Offertennummer und steht erst dann fest. */
            endziffern_aufrundung: boolean;
        };
        /** @description Antwort von ``POST /admin/quotes/extract-pdf``. */
        PdfAuszug: {
            supplier: string;
            supplier_label: string;
            supplier_id: string | null;
            project_ref: string;
            products: components["schemas"]["AuszugProdukt"][];
            available_pricing_rules?: components["schemas"]["Preisregel"][];
            /** @description Gegenprobe gegen die Belegsummen, z. B. eine beim Lesen verlorene Griesser-Zeile. */
            warnings?: string[];
        };
        PersonalDatei: {
            id: string;
            staff_id: string;
            /**
             * @description Register: MA-Gespräche, Vertrag/Unterschriften, Versicherungen, Zertifikate.
             * @enum {string}
             */
            category: "gespraech" | "vertrag" | "versicherung" | "zertifikat";
            filename: string;
            mime_type: string | null;
            size_bytes: number | null;
            created_at: string;
        };
        Personalordner: {
            /** @description Alle Dateien der Person, neueste zuerst. */
            dateien: components["schemas"]["PersonalDatei"][];
        };
        /** @description Ein Kandidat der Personen-Auswahl — die Antwort ist die id, kein Text. */
        PersonenWahl: {
            staff_id: string;
            name: string;
        };
        /** @description Genehmigte Absenz im Fenster — nur, was die Planung braucht. */
        PlanAbsenz: {
            /** @description null bei Altzeilen, die nur den Namen tragen — in der Tafel unsichtbar. */
            staff_id: string | null;
            staff_name: string;
            type: string;
            date_start: string;
            date_end: string;
            /** @description Halber Tag: am = Vormittag, pm = Nachmittag, null = ganzer Tag. */
            half_day?: ("am" | "pm") | null;
            /** @description Fertig formatiert («Ferien 24.08.–28.08.2026»). */
            label: string;
        };
        /**
         * @description Fingerabdruck der Kalenderdaten (``/admin/schedule/stand``): je ein md5 über
         *     Projekte und Termine. Der Live-Takt lädt eine Liste nur neu, wenn sich ihr Wert
         *     ändert.
         */
        PlanStand: {
            projekte: string;
            termine: string;
        };
        PlanerAbsenz: {
            id: string;
            staff_id: string | null;
            staff_name: string | null;
            type: string;
            status: string;
            date_start: string;
            date_end: string;
            half_day: string | null;
        };
        PlanerGruppe: {
            id: string;
            name: string;
            art: string;
            status: string;
        };
        PlanerSperrfrist: {
            id: string;
            titel: string;
            art: string;
            haerte: string;
            gruppe_ids: string[];
            von: string;
            bis: string;
        };
        /** @description Beide Vorlagen-Listen für die Verwaltungsmaske. */
        PositionsVorlagen: {
            installation: components["schemas"]["MontageVorlage"][];
            special: components["schemas"]["SonderVorlage"][];
        };
        Preisregel: {
            category: string;
            margin_factor: number;
        };
        /** @description Eine Position (POS-Zeile) eines Lieferanten-Produkts aus der PDF-Extraktion. */
        ProduktPosition: {
            label: string;
            ek_price: number;
            selected: boolean;
            separate: boolean;
        };
        /**
         * @description Produktzeile — die Metadaten (EK, Faktor, Lieferant, Positionen) sind
         *     preisneutral, aber für die Nachkalkulation da; ein Bearbeiten darf sie nicht
         *     verlieren.
         */
        ProduktZeile: {
            description: string;
            quantity: number;
            unit: string;
            unit_price: number;
            total_price: number;
            optional?: boolean;
            /** @description Preis der Zeile VOR der Endziffern-Aufrundung (Feature werkora_bonus). Beim Bearbeiten unverändert zurückschicken — sonst kann das Backend die bonusfreie Basis nicht mehr herstellen. */
            werkora_bonus_base_unit_price?: number;
            werkora_bonus_base_total_price?: number;
            ek_price?: number;
            margin_factor?: number;
            supplier_id?: string | null;
            category?: string | null;
            positions?: components["schemas"]["ProduktPosition"][];
        };
        /** @description Veraltet (Vorgänger von send-attachments, für gecachte PWA-Stände). */
        Prospekte: {
            prospekte: components["schemas"]["Anhang"][];
        };
        /** @description Ampel eines Mandanten; Fenster 7 Tage, Basis die 21 Tage davor. */
        RapportBotAmpel: {
            /** @enum {string} */
            stufe: "gruen" | "gelb" | "rot";
            /** @description Kurzfassung für die Anzeige (erster Grund oder die Quote). */
            text: string;
            gruende: string[];
            /** @description verworfen / (bestaetigt + verworfen), 7 Tage; null ohne Zusammenfassung. */
            quote: number | null;
            /** @description Dieselbe Quote in den 21 Tagen davor. */
            quote_basis: number | null;
            /** @description bestaetigt + verworfen, 7 Tage. */
            zusammenfassungen: number;
            zusammenfassungen_basis: number;
            /** @description Erfolg gemeldet ohne gespeicherten Rapport, 7 Tage. */
            falsche_erfolgsmeldung: number;
        };
        /** @description Mandanten-Teil des Rapport-Bot-Prompts: Branche, Produkte, Fachwörter, Mundart. */
        RapportBotFachgebiet: {
            /** @description Leer = kein Fachteil, der Bot arbeitet nur mit dem Grundprompt. */
            text: string;
            max_zeichen: number;
        };
        /**
         * @description Ampel über alle Mandanten (die schlechteste) und je Mandant. Nicht lesbar:
         *     nur ``status`` und ``days``.
         */
        RapportBotLage: {
            /** @enum {string} */
            status: "ok" | "nicht_lesbar";
            days: number;
            /** @enum {string} */
            ampel?: "gruen" | "gelb" | "rot";
            /** @description «<slug>: <Grund>», rot vor gelb. */
            gruende?: string[];
            /** @description Summe je Schlüssel über alle Mandanten im Zeitraum. */
            summen?: {
                [key: string]: number;
            };
            /** @description Nur Mandanten mit Zählung in den letzten 28 Tagen bzw. im Zeitraum; rot zuerst. */
            mandanten?: components["schemas"]["RapportBotMandant"][];
        };
        RapportBotMandant: {
            /** @description Slug des Mandanten. */
            mandant: string;
            ampel: components["schemas"]["RapportBotAmpel"];
            /** @description Summe je Schlüssel über den Zeitraum `days`. */
            summen: {
                [key: string]: number;
            };
        };
        RapportGeloescht: {
            status: string;
            report_id: number;
            /** @description Wie viele Lagerbuchungen zurückgebucht wurden. */
            stock_restored: number;
            warnings?: string[];
        };
        /** @description Antwort von Erfassen (201) und Bearbeiten. */
        RapportGespeichert: {
            report_id: number;
            /** @description Hinweise, die das Speichern nicht verhindert haben. */
            warnings?: string[];
        };
        /**
         * @description Vollständiger Inhalt eines Rapports für die Bearbeiten-Maske
         *     (``db.reports.get_manual_report_content`` plus Bearbeiten-Gate).
         */
        RapportInhalt: {
            report_date: string;
            description: string | null;
            massaufnahme?: boolean | null;
            beratung?: boolean | null;
            is_warranty?: boolean | null;
            art_der_arbeit?: string[] | null;
            einbauort?: string | null;
            is_partial?: boolean | null;
            /** @description Gesetzt: der Rapport steckt in einem Gesamtrapport und ist gesperrt. */
            merged_into_report_id?: number | null;
            staff: components["schemas"]["RapportStunden"][];
            materials: components["schemas"]["RapportMaterial"][];
            kleinmaterial: components["schemas"]["Kleinmaterial"] | null;
            fixed_materials: components["schemas"]["Fixposition"][];
            editable: boolean;
            edit_blocked_reason: string | null;
        };
        RapportMaterial: {
            art_nr: string;
            amount: number;
            item_name: string;
        };
        RapportStunden: {
            /** @description null bei Zeilen aus der Zeit vor der staff_id. */
            staff_id: string | null;
            name: string;
            hours: number;
            hour_type: string;
        };
        /** @description Ein Rapport in der Liste des Projekt-Details (``/admin/projects/{id}/reports``). */
        RapportZeile: {
            id: number;
            report_date: string;
            description: string | null;
            /** @description Wer den Rapport ERFASST hat — beim nacherfassten Rapport das Büro. */
            created_by: string | null;
            signature_timestamp: string | null;
            invoice_id: number | null;
            created_at: string;
            is_partial?: boolean | null;
            is_aggregate?: boolean | null;
            merged_into_report_id?: number | null;
            dissolved_at?: string | null;
            pl_accepted_at?: string | null;
            /** @description Wer vor Ort war: aus den erfassten Stunden, wie die Kopfzeile des Rapport-PDFs. Ohne Stunden (Massaufnahme/Beratung) der Erfasser. */
            monteure: string | null;
            storage_path?: string | null;
            /** @description 'chat' (Monteur-App) oder 'admin_manual' (im Projekt-Detail nacherfasst). */
            source?: string;
            /** @description Als Garantiefall erfasst (eigenes Badge). */
            is_warranty?: boolean | null;
        };
        /** @description Antwort von ``POST /admin/invoices/generate`` (``services/invoice_flow.py``). */
        RechnungErstellt: {
            status: string;
            invoice_id: number;
            invoice_number: string;
            total_amount: number;
            /** @description Sammelrechnung: bei mehreren angenommenen Offerten eines Projekts deckt EINE Rechnung alle noch unverrechneten ab — hier stehen deren Nummern. */
            quote_numbers: string[];
            /** @description Allg. Abzüge: abgezogener Betrag (netto) oder null. */
            general_deduction_amount: number | null;
            /** @description Abgezogene Anzahlungen (brutto) oder null. */
            anzahlung_total: number | null;
            /** @description 'anzahlung' bei einer Anzahlungsrechnung. */
            kind?: string | null;
            /** @description Hinweise, die den Erfolg nicht in Frage stellen (z.B. ein Rapport ohne Preis). Immer vorhanden, meist leer. */
            warnings: string[];
        };
        /** @description Eine Seite der Rechnungsliste (``/admin/invoices/list``). */
        RechnungSeite: {
            rows: components["schemas"]["RechnungZeile"][];
            /** @description Alle Treffer, nicht nur die Seite. */
            total: number;
            page: number;
            page_size: number;
        };
        /**
         * @description Eine Zeile der Rechnungsliste (``db.invoices.list_admin_invoices`` und
         *     ``…_page``: Kopfdaten plus flach gezogener Projekt-Embed).
         */
        RechnungZeile: {
            /** @description `invoices.id` ist bigint — eine Zahl, kein String. */
            id: number;
            invoice_number: string;
            project_name: string;
            total_amount: number;
            status: string;
            created_at: string;
            paid_at: string | null;
            /** @description Tatsächlich eingegangen, wenn weniger als `total_amount` (Skonto u. ä.); null = voll bezahlt. */
            paid_amount?: number | null;
            /** @description Mehrbetrag über `total_amount`, wenn der Kunde zu viel bezahlt hat (WS-49) — kein Umsatz, sondern Guthaben (zurückerstatten oder verrechnen). */
            ueberzahlung?: number | null;
            storage_path?: string | null;
            /** @description E-Mail des Kunden: auf der Betreiber-Liste aus `invoices.customer_id` (Rechnung ohne Projekt) — Vorbelegung im Senden-Dialog. */
            customer_email?: string | null;
            projektleiter_id: string | null;
            /** @description Projektbezug: nach dem Bezahlen fragt die Übersicht, ob das Projekt abgeschlossen werden soll — bei einem längst geschlossenen Projekt nicht. */
            project_id: string | null;
            project_status?: string | null;
            project_is_closed?: boolean | null;
            /** @description Offene Rechnung auf einem Projekt, das schon eine bezahlte Rechnung in der Höhe von Offerte/Rapport (±10 %) hat — braucht es sie noch? (services/verrechnung_check.py). null = nicht geprüft (Betreiber-Liste). */
            evtl_bereits_verrechnet?: boolean | null;
            /** @description Fällig am — gesetzt beim Versand (`set_invoice_sent_at`). Aus ihr leitet die Betreiber-Liste «Verspätet» ab; `null` heisst: noch nicht versendet, also nie verspätet. */
            due_date?: string | null;
            sent_at?: string | null;
            /** @description Freitext auf der Rechnung («Bemerkung»). */
            remark?: string | null;
            /** @description Bezug einer Rechnung ohne Projekt («Hagelschaden-Modul»); `null` = Projektrechnung. Die Betreiber-Liste zeigt ihn als «Beschreibung». */
            inhalt?: string | null;
            /** @description 'anzahlung' = Anzahlungsrechnung, null = gewöhnliche Rechnung. */
            invoice_kind?: string | null;
            /** @description Vom Mahnwesen ausgenommen (WW-86): fehlt in Mahn-Kachel und Board, Erinnerung/Mahnung gesperrt. null = Liste ohne die Spalte (Betreiber-Seite). */
            mahnstopp?: boolean | null;
        };
        Rechtschreibung: {
            corrected: string;
            /** @description false = das Modell hat nichts geändert. */
            changed: boolean;
        };
        /** @description Reserviertes Fenster einer offenen Anfrage — gestrichelt in der Plantafel. */
        Reservation: {
            id: string;
            datum: string;
            start: string;
            ende: string;
            monteur_ids: string[];
            /** @enum {string} */
            status: "reserviert" | "gewaehlt" | "frei" | "vergeben";
            text: string;
            project_id: string;
            reserviert_bis_text: string;
        };
        Reservationen: {
            reservationen: components["schemas"]["Reservation"][];
        };
        /** @description Ein gespeicherter Eintrag, dessen Konto keinen Zugriff mehr hat — zählt nicht (§5). */
        RuhenderEintrag: {
            aufgabe: string;
            /** @enum {string} */
            rolle: "zustaendig" | "stellvertretung";
            user_id: string;
            name: string;
            grund: string;
            grund_text: string;
        };
        /** @description Gespeicherte Regel einer Serie: `until` = Startdatum des letzten Termins. */
        Serienregel: {
            /** @enum {string} */
            freq: "daily" | "workdays" | "weekly" | "monthly";
            interval: number;
            until: string | null;
        };
        /** @description Skonto-Vorbelegung für neue Offerten. `is_set=false` = keine Vorgabe. */
        SkontoVorgabe: {
            pct: number | null;
            days: number | null;
            is_set: boolean;
        };
        /** @description Sonderpositions-Vorlage (``special_position_templates``). */
        SonderVorlage: {
            id: string;
            label: string;
            /**
             * @description 'pauschal' = 1 × Fixbetrag, 'stunden' = Stunden × CHF/h, 'stueck' = Stück × CHF/Stk.
             * @enum {string}
             */
            pricing_mode: "pauschal" | "stunden" | "stueck";
            default_fee: number;
            default_hours: number | null;
            notes: string | null;
            /** @description Nur in der Verwaltungsliste. */
            sort_order?: number;
        };
        Sperrfrist: {
            id: string;
            titel: string;
            art: string;
            datum_von: string;
            datum_bis: string;
            jaehrlich: boolean;
            gruppe_ids: string[];
            haerte: string;
            gueltig_ab: string | null;
            gueltig_bis: string | null;
            notiz: string;
            status: string;
            quelle: string;
        };
        /** @description Ein Termin (``project_appointments``, die ganze Zeile). */
        Termin: {
            id: string;
            project_id: string;
            start_date: string;
            end_date: string | null;
            start_time: string | null;
            end_time: string | null;
            /** @enum {string} */
            kind: "aufmass" | "demontage" | "montage" | "wiedermontage" | "service" | "reparatur" | "garantie" | "sonstiges";
            label: string | null;
            /** @description Team dieses Termins; null/leer = Projekt-Team gilt. */
            monteur_ids: string[] | null;
            /** @description Klammer über die Termine einer Serie; null = Einzeltermin. Jeder Termin einer Serie ist eine eigene Zeile. */
            series_id?: string | null;
            /** @description Regel der Serie, auf jeder Zeile gleich; null bei Einzelterminen. */
            series_rule?: components["schemas"]["Serienregel"] | null;
            /** @description Terminbestätigung an den Kunden: zuletzt gesendet; null = nie. */
            customer_notice_sent_at?: string | null;
            customer_notice_to?: string | null;
            customer_notice_snapshot?: components["schemas"]["BestaetigungStand"] | null;
            /** @description Farbkategorie (Schlüssel aus den Terminfarben des Betriebs); null = Farbe der Einsatz-Art. Spec termin-farbkategorien. */
            color_category?: string | null;
        };
        /** @description Antwort von ``POST …/appointments``: der ERSTE Termin, bei einer Serie mit Anzahl. */
        TerminAngelegt: {
            id: string;
            project_id: string;
            start_date: string;
            end_date: string | null;
            start_time: string | null;
            end_time: string | null;
            /** @enum {string} */
            kind: "aufmass" | "demontage" | "montage" | "wiedermontage" | "service" | "reparatur" | "garantie" | "sonstiges";
            label: string | null;
            /** @description Team dieses Termins; null/leer = Projekt-Team gilt. */
            monteur_ids: string[] | null;
            /** @description Klammer über die Termine einer Serie; null = Einzeltermin. Jeder Termin einer Serie ist eine eigene Zeile. */
            series_id?: string | null;
            /** @description Regel der Serie, auf jeder Zeile gleich; null bei Einzelterminen. */
            series_rule?: components["schemas"]["Serienregel"] | null;
            /** @description Terminbestätigung an den Kunden: zuletzt gesendet; null = nie. */
            customer_notice_sent_at?: string | null;
            customer_notice_to?: string | null;
            customer_notice_snapshot?: components["schemas"]["BestaetigungStand"] | null;
            /** @description Farbkategorie (Schlüssel aus den Terminfarben des Betriebs); null = Farbe der Einsatz-Art. Spec termin-farbkategorien. */
            color_category?: string | null;
            series_count: number;
        };
        TerminArtAuswahl: {
            key: string;
            label: string;
        };
        /** @description Vorgaben des Betriebs je Termin-Art und die Arten, für die es eine geben kann. */
        TerminDauerVorgaben: {
            vorgaben: {
                [key: string]: components["schemas"]["Dauer"];
            };
            arten: components["schemas"]["TerminArtAuswahl"][];
        };
        /** @description Eine Farbkategorie des Betriebs; `key` steht am Termin (`color_category`). */
        TerminFarbe: {
            key: string;
            label: string;
            /** @description #rrggbb */
            color: string;
            /** @description Farbe für Termine von Kundenprojekten ohne eigene Terminfarbe; höchstens ein Eintrag, fehlt sonst */
            standard?: boolean | null;
            /** @description An jedem Termin-Typ eines Kundenprojekts wählbar (z.B. Reservation, Kunde hat noch nicht bestätigt); höchstens ein Eintrag, fehlt sonst */
            markierung?: boolean | null;
        };
        /** @description Die Terminfarben des Betriebs, in der gepflegten Reihenfolge. */
        TerminFarben: {
            kategorien: components["schemas"]["TerminFarbe"][];
        };
        /** @description Antwort von ``PATCH /admin/appointments/{id}``. */
        TerminGeaendert: {
            id: string;
            project_id: string;
            start_date: string;
            end_date: string | null;
            start_time: string | null;
            end_time: string | null;
            /** @enum {string} */
            kind: "aufmass" | "demontage" | "montage" | "wiedermontage" | "service" | "reparatur" | "garantie" | "sonstiges";
            label: string | null;
            /** @description Team dieses Termins; null/leer = Projekt-Team gilt. */
            monteur_ids: string[] | null;
            /** @description Klammer über die Termine einer Serie; null = Einzeltermin. Jeder Termin einer Serie ist eine eigene Zeile. */
            series_id?: string | null;
            /** @description Regel der Serie, auf jeder Zeile gleich; null bei Einzelterminen. */
            series_rule?: components["schemas"]["Serienregel"] | null;
            /** @description Terminbestätigung an den Kunden: zuletzt gesendet; null = nie. */
            customer_notice_sent_at?: string | null;
            customer_notice_to?: string | null;
            customer_notice_snapshot?: components["schemas"]["BestaetigungStand"] | null;
            /** @description Farbkategorie (Schlüssel aus den Terminfarben des Betriebs); null = Farbe der Einsatz-Art. Spec termin-farbkategorien. */
            color_category?: string | null;
            series_updated: number;
            series_created: number;
            series_deleted: number;
        };
        /** @description Ein Fenster einer Terminanfrage (``terminwahl_service.option_fuer_client``). */
        TerminOption: {
            id: string;
            datum: string;
            start: string;
            ende: string;
            monteur_ids: string[];
            /** @enum {string} */
            status: "reserviert" | "gewaehlt" | "frei" | "vergeben";
            text: string;
        };
        /** @description ``POST /admin/projects/{id}/terminvorschlaege`` (``terminvorschlag_service.vorschlaege``). */
        TerminVorschlaege: {
            vorschlaege: components["schemas"]["TerminVorschlag"][];
            ausgeschlossen: components["schemas"]["VorschlagAusgeschlossen"][];
            hinweise: string[];
            /** @description Warum es keinen Vorschlag gibt — leer, wenn es welche gibt. */
            grund: string;
            kind: string;
            /** @description Dauer, mit der gerechnet wurde (Eingabe oder Vorgabe der Art). */
            dauer_min: number;
            /** @description Arbeitstage, über die gerechnet wurde. */
            horizont: number;
            /** @description Letzter Tag des Horizonts. */
            bis: string;
        };
        /** @description Ein Vorschlag aus Monteur, Tag und Fenster (``terminvorschlag_regeln.fuer_client``). */
        TerminVorschlag: {
            staff_id: string;
            name: string;
            datum: string;
            /** @description «HH:MM» */
            start: string;
            /** @description «HH:MM» — Ende des Fensters für den Kunden (mindestens die Breite des Kundenfensters). */
            ende: string;
            /** @description 0–100 aus Weg, Früh, kennt die Anlage, Ausgleich. */
            score: number;
            gruende: string[];
        };
        /** @description Eine Terminanfrage des Projekts (Zeile aus ``terminanfragen`` plus Fenster). */
        Terminanfrage: {
            id: string;
            /** @enum {string} */
            status: "offen" | "gewaehlt" | "keiner_passt" | "abgelaufen" | "zurueckgezogen";
            grund: ("keine_antwort" | "keine_fenster") | null;
            empfaenger: string;
            reserviert_bis: string;
            reserviert_bis_text: string;
            gesendet_at: string | null;
            erinnert_at: string | null;
            hinweis_kunde: string | null;
            created_at: string;
            optionen: components["schemas"]["TerminOption"][];
            /** @description «etwa 1 bis 2 Stunden» — leer ohne Angabe. */
            dauer_text: string;
        };
        /** @description Antwort von ``POST /admin/appointments/{id}/customer-notice``. */
        Terminbestaetigung: {
            to: string;
            sent_at: string;
            is_update: boolean;
            /** @description false = Mail ist raus, aber der Versandstand liess sich nicht speichern. */
            recorded: boolean;
        };
        /** @description Kachel «Terminwahl» im Projekt (``terminwahl_service.ansicht``). */
        TerminwahlAnsicht: {
            anfragen: components["schemas"]["Terminanfrage"][];
            /** @description «YYYY-MM-DDTHH:MM» Schweizer Zeit — Vorbelegung von «reserviert bis». */
            vorgabe_reserviert_bis: string;
            empfaenger_vorschlag: string;
            kundenlink: string | null;
            /** @description Vorgaben je Termin-Art aus Einstellungen → Termindauer (nur gesetzte Arten). */
            dauer_vorgaben: {
                [key: string]: components["schemas"]["Dauer"];
            };
        };
        /** @description Rapport-Auswahl (``/admin/invoices/billable-reports``). */
        VerrechenbareRapporte: {
            reports: components["schemas"]["VerrechenbarerRapport"][];
        };
        /** @description Ein verrechenbarer Rapport in der Auswahl des Erstellen-Dialogs. */
        VerrechenbarerRapport: {
            id: number;
            report_date: string | null;
            created_by: string | null;
            description: string;
            hours: number;
            signed: boolean;
            /** @description Garantiefall (WW-33): Abzeichen in der Auswahl, nicht vorgewählt. */
            is_warranty: boolean;
        };
        /**
         * @description ``/admin/quotes/{id}/send-attachments``: zwei getrennte Schalter — `enabled` für
         *     die Dokumente (Feature prospekt_mit_offerte), `fotos_enabled` für die Projekt-Fotos
         *     (Feature fotos_mit_offerte).
         */
        VersandAnhaenge: {
            enabled: boolean;
            fotos_enabled: boolean;
            project_id: string | null;
            projekt_anhaenge: components["schemas"]["Anhang"][];
            vorlagen: components["schemas"]["Anhang"][];
            projekt_fotos: components["schemas"]["Foto"][];
        };
        /** @description ``/admin/quotes/{id}/send-group``: leer = Einzelversand. */
        Versandgruppe: {
            members: components["schemas"]["Gruppenmitglied"][];
        };
        Vorlage: {
            key: string;
            /** @description 'sperrfrist' oder 'regel'. */
            art: string;
            titel: string;
            beschreibung: string;
            daten: {
                [key: string]: unknown;
            };
        };
        /** @description Summe eines Blocks mit Rabatt; ``rabatt_herkunft`` ist 'eingabe' | 'projekt' | 'keiner'. */
        VorschauBlock: {
            summe: number;
            rabatt_pct: number;
            rabatt_betrag: number;
            rabatt_herkunft: string;
        };
        VorschauFixpreis: {
            betrag: number;
            /** @description False: über der Kalkulation oder unter Lohn + Pauschalen. */
            erreicht: boolean;
            /** @description Abgeleiteter Rabatt auf die Waren in CHF. */
            rabatt_betrag: number;
            /** @description Derselbe Rabatt in Prozent der Waren. */
            rabatt_pct: number;
        };
        VorschauKatalogPreis: {
            art_nr: string;
            preis: number;
            total: number;
        };
        /** @description Rohertrag auf den Waren — nur fürs Büro, steht nie auf einem Beleg. */
        VorschauMarge: {
            ek: number;
            vk_nach_rabatt: number;
            rohertrag: number;
            /** @description null, wenn keine Ware einen EK hat. */
            prozent: number | null;
            zeilen_ohne_ek: number;
        };
        /** @description Rabattfreie Positionen: Montage, Sonderaufwände, Sonderpositionen, Fahrspesen. */
        VorschauPauschalen: {
            summe: number;
            fahrspesen: number;
        };
        /** @description Rabatte des Projekts — die neue Maske belegt die Felder damit sichtbar vor. */
        VorschauProjektRabatt: {
            lohn_pct: number;
            waren_pct: number;
        };
        VorschlagAusgeschlossen: {
            staff_id: string;
            name: string;
            /** @description «Skill Wärmepumpe fehlt», «Ferien 18.11.–20.11.2026», «im Horizont keine passende Lücke». */
            grund: string;
        };
        /** @description ``/schedule/week``: immer sieben Tage, auch die leeren. */
        Wochenplan: {
            week_start: string;
            week_end: string;
            week_number: number;
            week_label: string;
            has_any: boolean;
            days: components["schemas"]["Wochentag"][];
        };
        Wochentag: {
            iso: string;
            /** @description 'Montag' … 'Sonntag' */
            weekday: string;
            /** @description '24.08.2026' */
            date: string;
            /** @description '24.08.' */
            short: string;
            entries: components["schemas"]["Einsatz"][];
        };
        ZuschlagZeile: {
            description: string;
            total_price: number;
            /** @description Automatisch ergänzte Endziffern-Aufrundung (Feature werkora_bonus). Beim Bearbeiten unverändert zurückschicken. */
            werkora_bonus?: boolean;
        };
        /** @description ``…/mail-eingang/zustaendigkeiten`` der Betreiber-Seite (Spec §8). */
        ZustaendigkeitenBetreiber: {
            aufgaben: components["schemas"]["AufgabeImKatalog"][];
            /** @enum {string} */
            standard_ansicht: "alle" | "meine";
            /** @description Die gespeicherte Matrix je Aufgabe — ruhende Einträge eingeschlossen. */
            zustaendigkeiten: {
                [key: string]: components["schemas"]["ZustaendigkeitsBlock"];
            };
            /** @description Wer im Organigramm stehen kann, nach Namen. */
            personen: components["schemas"]["BerechtigtePerson"][];
            ruhend: components["schemas"]["RuhenderEintrag"][];
            modul_aktiv: boolean;
            updated_at: string | null;
            updated_by: string | null;
        };
        /** @description Eine Aufgabe im Organigramm: Kennungen der Konten je Rolle. */
        ZustaendigkeitsBlock: {
            zustaendig: string[];
            stellvertretung: string[];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
