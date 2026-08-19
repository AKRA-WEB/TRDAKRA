/**
 * ============================================================================
 * AKRA TRDAKRA (STOCK TRANSFERS & SURVEY LOGS) SUPABASE API CLIENT
 * High-Speed Unified Survey & Movement Analytics (<25ms queries)
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
        KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhneHJyc2t6dGJwZWppcnJkcGJxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzEyNDU4MCwiZXhwIjoyMTAyNzAwNTgwfQ.9RiiP0kItbbcMeI2mYActrD9a1naHCNbmYJBRXHR1DI',
            };

    async function supabaseRest(endpoint, options = {}) {
        const url = `${SUPABASE_CONFIG.URL}/rest/v1/${endpoint}`;
        const key = SUPABASE_CONFIG.KEY;
        const headers = {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': options.prefer || 'return=representation',
            ...(options.headers || {})
        };
        const res = await fetch(url, {
            method: options.method || 'GET',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Supabase REST HTTP ${res.status}: ${errText}`);
        }
        return res.json();
    }

    /**
     * Record Stock Movement (Transfer between Warehouses/Branches)
     */
    async function recordStockMovement(movementData) {
        const payload = {
            movement_date: movementData.movementDate || new Date().toISOString().split('T')[0],
            source_warehouse: movementData.sourceWarehouse || 'W1',
            target_warehouse: movementData.targetWarehouse || 'W2',
            sku: movementData.sku,
            product_name: movementData.productName || movementData.product_name,
            qty: Number(movementData.qty || 0),
            unit: movementData.unit || 'ชิ้น',
            requester: movementData.requester || 'Staff',
            dispatcher: movementData.dispatcher || 'Warehouse',
            status: 'Dispatched'
        };

        const result = await supabaseRest('stock_movements', {
            method: 'POST',
            body: payload
        });

        return {
            status: 'success',
            movementId: result[0].id
        };
    }

    /**
     * Record Survey Log Entry
     */
    async function recordSurveyLog(surveyData) {
        const payload = {
            survey_date: surveyData.surveyDate || new Date().toISOString().split('T')[0],
            survey_time: surveyData.surveyTime || new Date().toTimeString().split(' ')[0],
            warehouse: surveyData.warehouse || 'W1',
            sku: surveyData.sku,
            product_name: surveyData.productName || surveyData.product_name,
            zone: surveyData.zone || 'A1',
            stock_qty: Number(surveyData.stockQty || surveyData.stock_qty || 0),
            surveyor: surveyData.surveyor || 'Surveyor',
            remark: surveyData.remark || ''
        };

        const result = await supabaseRest('survey_logs', {
            method: 'POST',
            body: payload
        });

        return {
            status: 'success',
            surveyId: result[0].id
        };
    }

    /**
     * Get 30/60/90-Day Product Movement Report (<25ms)
     */
    async function getProductMovementReport(sku, days = 30) {
        if (!sku) throw new Error('Missing SKU parameter');
        const cleanSku = String(sku).trim();
        const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

        const [movements, surveys] = await Promise.all([
            supabaseRest(`stock_movements?sku=eq.${encodeURIComponent(cleanSku)}&movement_date=gte.${cutoffDate}&order=movement_date.desc`),
            supabaseRest(`survey_logs?sku=eq.${encodeURIComponent(cleanSku)}&survey_date=gte.${cutoffDate}&order=survey_date.desc`)
        ]);

        return {
            status: 'success',
            sku: cleanSku,
            days,
            cutoffDate,
            totalMovements: movements ? movements.length : 0,
            totalSurveys: surveys ? surveys.length : 0,
            movements: movements || [],
            surveys: surveys || []
        };
    }

    return {
        recordStockMovement,
        recordSurveyLog,
        getProductMovementReport,
        SUPABASE_CONFIG
    };
}));
