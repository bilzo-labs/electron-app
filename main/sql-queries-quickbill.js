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
      // Build WHERE clause conditions
      const conditions = [];

      // Filter by receiptNo if provided (get receipts with voucherno greater than the provided receiptNo)
      if (receiptNo !== null && receiptNo !== undefined) {
        // String comparison since voucherno is a VARCHAR field
        conditions.push(`qbvoucherheader.voucherno > @receiptNo`);
      }

      // Date filter - default to last 24 hours if no sinceDate provided
      if (sinceDate) {
        conditions.push(`qbvoucherheader.voucherDate > @sinceDate`);
      } else {
        // conditions.push(`qbvoucherheader.voucherDate >= DATEADD(hour, -24, GETDATE())`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Query based on getReceiptDetail structure - get recent receipts sorted from latest to oldest
      const query = `
        SELECT TOP ${limit}
          qbvoucherheader.QBGUID as GUID,
          qbvoucherheader.voucherno as receiptNo,
          qbvoucherheader.voucherDate as date,
          qbvoucherheader.vchnetamount as totalAmount,
          qbledger.LedgerName as fullName,
          qbmailingaddres.MobileNo as mobileNumber,
          payModes.PayModeName as method,
          tenderDetails.ReceiptAmt as amount,
          NULL as CreatedBy
        FROM QbVoucherHeader as qbvoucherheader WITH (NOLOCK)
        JOIN QbLedger as qbledger WITH (NOLOCK)
          ON qbledger.QBGUID = qbvoucherheader.PartyGUID 
        JOIN QbMaillingAddress as qbmailingaddres WITH (NOLOCK)
          ON qbledger.QBGUID = qbmailingaddres.LinkGUID
        JOIN QbTenderDetails as tenderDetails WITH (NOLOCK)
          ON tenderDetails.VchHdrGUID = qbvoucherheader.QBGUID
        JOIN QbPayModes as payModes WITH (NOLOCK)
          ON payModes.QBGUID = tenderDetails.PayModeGuid
        ${whereClause}
        ORDER BY qbvoucherheader.voucherno DESC, qbvoucherheader.voucherDate DESC
      `;

      const request = pool.request();

      // Add receiptNo parameter if provided
      if (receiptNo !== null && receiptNo !== undefined) {
        request.input('receiptNo', sql.VarChar, receiptNo.toString());
      }

      // Add sinceDate parameter if provided
      if (sinceDate) {
        request.input('sinceDate', sql.DateTime, new Date(sinceDate));
      }
      const result = await request.query(query);
      return result.recordset;
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

      const result = await request.query(itemQuery);
      return result.recordset;
    } catch (error) {
      logger.error('Error fetching recent receipts from QuickBill:', error);
      throw error;
    }
  }
}

module.exports = QuickBillQueries;
