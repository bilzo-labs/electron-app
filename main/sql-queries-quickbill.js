const sql = require('mssql');
const getLogger = require('../shared/logger');
const logger = getLogger();
class QuickBillQueries {
  /**
   * Get recent receipts from QuickBill database
   * Returns receipts sorted from latest to oldest, filtered by receiptNo if provided
   *
   * @param {*} pool - SQL connection pool
   * @param {number} limit - Maximum number of receipts to fetch
   * @param {string|Date} sinceDate - Optional date to fetch receipts after (if null, fetches last 24 hours)
   * @param {string|number} receiptNo - Optional receipt number to filter receipts (only returns receipts newer than this)
   */

  static async getRecentReceipts(pool, receiptNo = null) {
    try {
      const conditions = [];
      const normalizedReceiptNo =
        receiptNo !== null && receiptNo !== undefined && String(receiptNo).trim() !== ''
          ? String(receiptNo).trim()
          : null;

      // ReceiptNo filter: SAME prefix, numeric suffix > provided receiptNo
      if (normalizedReceiptNo) {
        // Check if receiptNo contains a slash (has prefix)
        conditions.push(
          `
          qbvoucherheader.voucherno > @receiptNo
          AND
          CASE
            WHEN CHARINDEX('/', REVERSE(@receiptNo)) > 0
            THEN
              CASE
                WHEN qbvoucherheader.voucherno LIKE
                  LEFT(
                    @receiptNo,
                    LEN(@receiptNo) - CHARINDEX('/', REVERSE(@receiptNo)) + 1
                  ) + '%'
                  AND CHARINDEX('/', REVERSE(qbvoucherheader.voucherno)) > 0
                THEN
                  CASE
                    WHEN CAST(
                      RIGHT(
                        qbvoucherheader.voucherno,
                        CHARINDEX('/', REVERSE(qbvoucherheader.voucherno)) - 1
                      ) AS INT
                    ) >
                    CAST(
                      RIGHT(
                        @receiptNo,
                        CHARINDEX('/', REVERSE(@receiptNo)) - 1
                      ) AS INT
                    )
                    THEN 1
                    ELSE 0
                  END
                ELSE 0
              END
            ELSE 1
          END = 1
        `.trim()
        );
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const query = `
        SELECT
          qbvoucherheader.QBGUID AS GUID,
          qbvoucherheader.voucherno AS receiptNo,
          qbvoucherheader.DateInsert AS date,
          qbvoucherheader.vchnetamount AS totalAmount,
          qbledger.LedgerName AS fullName,
          qbmailingaddres.MobileNo AS mobileNumber,
          payModes.PayModeName AS method,
          tenderDetails.ReceiptAmt AS amount,
          NULL AS CreatedBy
        FROM QbVoucherHeader AS qbvoucherheader WITH (NOLOCK)
        JOIN QbLedger AS qbledger WITH (NOLOCK)
          ON qbledger.QBGUID = qbvoucherheader.PartyGUID
        JOIN QbMaillingAddress AS qbmailingaddres WITH (NOLOCK)
          ON qbledger.QBGUID = qbmailingaddres.LinkGUID
        JOIN QbTenderDetails AS tenderDetails WITH (NOLOCK)
          ON tenderDetails.VchHdrGUID = qbvoucherheader.QBGUID
        JOIN QbPayModes AS payModes WITH (NOLOCK)
          ON payModes.QBGUID = tenderDetails.PayModeGuid
        ${whereClause}
        ORDER BY qbvoucherheader.voucherno DESC,
                 qbvoucherheader.DateInsert DESC
      `;

      const request = pool.request();

      if (normalizedReceiptNo) {
        request.input('receiptNo', sql.VarChar(50), normalizedReceiptNo);
      }

      const result = await request.query(query);
      logger.info('Found results in the recent receipts query', result.recordset.length);
      return result.recordset || [];
    } catch (error) {
      logger.error('Error fetching recent receipts from QuickBill:', error);
      throw error;
    }
  }

  static async getItemDetails(pool, invoiceId) {
    try {
      const itemQuery = `select qbitemmaster.ItemDescription as name, qbvoucheritems.NoOfCount as quantity, 
qbvoucheritems.SerialNo as serialNo, 
qbvoucheritems.itemRate as unitPrice, 
qbvoucheritems.itemBaseValue as taxableAmount, 
qbvoucheritems.SalemanGUID,
qbvoucheritems.TaxAmount as gstAmount,
qbvoucheritems.TaxPerc as gst,
qbitemmaster.Class1GUID as category,
qbitemmaster.Class2GUID as brand,
qbvoucheritems.ItemNetAmount as netAmount, 
qbvoucheritems.ItemLvlDiscAmt as discountAmount, 
qbvoucheritems.ItemLvlDiscPerc as discountPercentage, 
qbvoucheritems.DocLvlDiscAmt as billDiscountAmount   
from  QbVoucherItems as qbvoucheritems 
join QbItemMaster as qbitemmaster on qbvoucheritems.ItemGUID = qbitemmaster.QBGUID 
where VchHdrGUID = '${invoiceId}';`;
      const request = pool.request();

      // Add receiptNo parameter if provided
      if (invoiceId !== null && invoiceId !== undefined) {
        request.input('invoiceId', sql.VarChar, invoiceId.toString());
      }
      logger.info('QuickBill item for invoice:', invoiceId);
      const result = await request.query(itemQuery);
      logger.info('Found results in the item query', result.recordset.length);
      return result.recordset;
    } catch (error) {
      logger.error('Error fetching recent receipts from QuickBill:', error);
      throw error;
    }
  }

  static async getReceiptByReceiptNo(pool, receiptNo) {
    try {
      const normalizedReceiptNo =
        receiptNo !== null && receiptNo !== undefined && String(receiptNo).trim() !== ''
          ? String(receiptNo).trim()
          : null;
      logger.info('Receipt number:', normalizedReceiptNo);
      if (!normalizedReceiptNo) {
        throw new Error('Receipt number is required');
      }
  
      const query = `
        SELECT
          qbvoucherheader.QBGUID AS GUID,
          qbvoucherheader.voucherno AS receiptNo,
          qbvoucherheader.DateInsert AS date,
          qbvoucherheader.vchnetamount AS totalAmount,
          qbledger.LedgerName AS fullName,
          qbmailingaddres.MobileNo AS mobileNumber,
          payModes.PayModeName AS method,
          tenderDetails.ReceiptAmt AS amount,
          NULL AS CreatedBy
        FROM QbVoucherHeader AS qbvoucherheader WITH (NOLOCK)
        JOIN QbLedger AS qbledger WITH (NOLOCK)
          ON qbledger.QBGUID = qbvoucherheader.PartyGUID
        JOIN QbMaillingAddress AS qbmailingaddres WITH (NOLOCK)
          ON qbledger.QBGUID = qbmailingaddres.LinkGUID
        JOIN QbTenderDetails AS tenderDetails WITH (NOLOCK)
          ON tenderDetails.VchHdrGUID = qbvoucherheader.QBGUID
        JOIN QbPayModes AS payModes WITH (NOLOCK)
          ON payModes.QBGUID = tenderDetails.PayModeGuid
        WHERE qbvoucherheader.voucherno = @receiptNo
      `;
  
      const request = pool.request();
      request.input('receiptNo', sql.VarChar(50), normalizedReceiptNo);
  
      const result = await request.query(query);
      
      if (result.recordset && result.recordset.length > 0) {
        logger.info(`Found receipt details for receiptNo: ${normalizedReceiptNo}`);
        return result.recordset; // Return single receipt object
      } else {
        logger.info(`No receipt found for receiptNo: ${normalizedReceiptNo}`);
        return [];
      }
    } catch (error) {
      logger.error(`Error fetching receipt details for receiptNo ${receiptNo}:`, error);
      throw error;
    }
  }
}

module.exports = QuickBillQueries;
