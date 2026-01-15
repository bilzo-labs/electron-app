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

  static async getRecentReceipts(pool, limit = 50, sinceDate = null, receiptNo = null) {
    try {
      const conditions = [];

      const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
      const normalizedReceiptNo =
        receiptNo !== null && receiptNo !== undefined && String(receiptNo).trim() !== ''
          ? String(receiptNo).trim()
          : null;

      // ReceiptNo filter: SAME prefix, numeric suffix <= provided receiptNo
      if (normalizedReceiptNo) {
        conditions.push(
          `
          LTRIM(RTRIM(qbvoucherheader.voucherno)) LIKE
            LEFT(
              LTRIM(RTRIM(@receiptNo)),
              LEN(LTRIM(RTRIM(@receiptNo))) - CHARINDEX('/', REVERSE(LTRIM(RTRIM(@receiptNo)))) + 1
            ) + '%'
          AND
          CASE
            WHEN RIGHT(
                   LTRIM(RTRIM(qbvoucherheader.voucherno)),
                   CHARINDEX('/', REVERSE(LTRIM(RTRIM(qbvoucherheader.voucherno)))) - 1
                 ) NOT LIKE '%[^0-9]%'
            THEN CAST(
                   RIGHT(
                     LTRIM(RTRIM(qbvoucherheader.voucherno)),
                     CHARINDEX('/', REVERSE(LTRIM(RTRIM(qbvoucherheader.voucherno)))) - 1
                   ) AS INT
                 )
            ELSE -1
          END <=
          CAST(
            RIGHT(
              LTRIM(RTRIM(@receiptNo)),
              CHARINDEX('/', REVERSE(LTRIM(RTRIM(@receiptNo)))) - 1
            ) AS INT
          )
        `.trim()
        );
      }

      if (sinceDate) {
        conditions.push(`qbvoucherheader.DateInsert > @sinceDate`);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const query = `
        SELECT TOP (${safeLimit})
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
        ORDER BY qbvoucherheader.DateInsert DESC,
                 qbvoucherheader.voucherno DESC
      `;

      const request = pool.request();

      if (normalizedReceiptNo) {
        request.input('receiptNo', sql.VarChar(50), normalizedReceiptNo);
      }
      if (sinceDate) {
        request.input('sinceDate', sql.DateTime, new Date(sinceDate));
      }

      const result = await request.query(query);
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
      logger.info('QuickBill item query:', itemQuery);
      const result = await request.query(itemQuery);
      logger.info('QuickBill item result:', result.recordset);
      return result.recordset;
    } catch (error) {
      logger.error('Error fetching recent receipts from QuickBill:', error);
      throw error;
    }
  }
}

module.exports = QuickBillQueries;
