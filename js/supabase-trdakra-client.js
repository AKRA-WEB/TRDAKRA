/**
 * ============================================================================
 * AKRA TRDAKRA SUPABASE API CLIENT
 * Status: DEACTIVATED / CONTAINED for Security Hardening (Plan 20260820-004)
 * Stock movements and survey logging execute via authoritative backend (GAS).
 * ============================================================================
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.AkraSupabaseTRD = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const SUPABASE_CONFIG = {
        URL: 'https://hgxrrskztbpejirrdpbq.supabase.co',
        KEY: ''
    };

    return {
        recordStockMovement: async () => { throw new Error('Supabase TRD client deactivated. Falling back to GAS.'); },
        recordSurveyLog: async () => { throw new Error('Supabase TRD client deactivated. Falling back to GAS.'); },
        getProductMovementReport: async () => { throw new Error('Supabase TRD client deactivated. Falling back to GAS.'); }
    };
}));
