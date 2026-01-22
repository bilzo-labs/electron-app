const sql = require('mssql');
const { config } = require('../shared/config');
const getLogger = require('../shared/logger');
const HDPOSQueries = require('./sql-queries-hdpos');
const QuickBillQueries = require('./sql-queries-quickbill');
const logger = getLogger();

class SQLConnector {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    logger.info(`SQL Connector initialized`);
  }

  getPosType() {
    return config.pos.type;
  }

  async connect() {
    try {
      if (this.pool && this.isConnected) {
        return this.pool;
      }

      logger.info('Connecting to SQL Server...');
      this.pool = await sql.connect(config.sqlServer);
      this.isConnected = true;
      logger.info('SQL Server connected successfully');

      // Handle connection errors
      this.pool.on('error', (err) => {
        logger.error('SQL Pool Error:', err);
        this.isConnected = false;
      });

      return this.pool;
    } catch (error) {
      logger.error('SQL Connection Error:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.pool) {
        await this.pool.close();
        this.isConnected = false;
        logger.info('SQL Server disconnected');
      }
    } catch (error) {
      logger.error('SQL Disconnect Error:', error);
    }
  }

  async getRecentReceipts(receiptNo = null) {
    try {
      const pool = await this.connect();
      const posType = this.getPosType();

      // Use HDPOS queries if POS type is HDPOS
      if (posType === 'HDPOS') {
        logger.debug('Using HDPOS-specific queries');
        return await HDPOSQueries.getRecentReceipts(pool, limit, sinceDate);
      }

      // Use QuickBill queries if POS type is QUICKBILL
      if (posType === 'QUICKBILL') {
        logger.debug('Using QuickBill-specific queries');

        // If no receiptNo provided, return empty array to prevent full DB scan
        if (!receiptNo) {
          logger.warn('No receiptNo provided for QuickBill query - skipping to prevent full database scan');
          return [];
        }

        return await QuickBillQueries.getRecentReceipts(pool, receiptNo);
      }

      // Generic query for other POS systems
      logger.debug('Using generic queries');

      // If no receiptNo provided, return empty array
      if (!receiptNo) {
        logger.warn('No receiptNo provided for generic query - skipping to prevent full database scan');
        return [];
      }

      const query = `
        SELECT
          SalesInvoice.Id as InvoiceId,
          SalesInvoice.InvNumber as BillNumber,
          SalesInvoice.Date as InvoiceDate,
          SalesInvoice.GrandTotal,
          Customer.Name as CustomerName,
          Contact.MobileNumber as CustomerMobile,
          SalesInvoice.Creator as CreatedBy
        FROM tbl_DYN_SalesInvoices as SalesInvoice WITH (NOLOCK)
        LEFT JOIN tbl_DYN_SalesInvoices_Customers as sicust WITH (NOLOCK)
          ON sicust.SalesInvoiceId = SalesInvoice.Id
        LEFT JOIN tbl_DYN_Customers as Customer WITH (NOLOCK)
          ON Customer.Id = sicust.CustomerId
        LEFT JOIN tbl_DYN_Customers_Addresses as CustomerAddress WITH (NOLOCK)
          ON CustomerAddress.CustomerId = Customer.id
        LEFT JOIN tbl_DYN_Addresses_Contacts as adcont WITH (NOLOCK)
          ON adcont.AddressId = CustomerAddress.AddressId
        LEFT JOIN tbl_DYN_Contacts as Contact WITH (NOLOCK)
          ON Contact.id = adcont.ContactId
        WHERE SalesInvoice.InvNumber > @receiptNo
        ORDER BY SalesInvoice.InvNumber ASC
      `;

      const request = pool.request();
      request.input('receiptNo', sql.VarChar(50), receiptNo);

      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error fetching recent receipts:', error);
      throw error;
    }
  }

  async getSingleReceipt(receiptNo){
    const pool = await this.connect();
    const posType = this.getPosType();
    try{
    if (posType === 'QUICKBILL') {
      logger.debug('Using QuickBill-specific queries');

      // If no receiptNo provided, return empty array to prevent full DB scan
      if (!receiptNo) {
        logger.warn('No receiptNo provided for QuickBill query - skipping to prevent full database scan');
        return [];
      }

      return await QuickBillQueries.getReceiptByReceiptNo(pool, receiptNo);
    }
    } catch (error) {
      logger.error('Error fetching single receipt:', error);
      throw error;
    }
  }

  async getItemDetails(invoiceId) {
    try {
      const pool = await this.connect();
      const posType = this.getPosType();

      // Use HDPOS queries if POS type is HDPOS
      if (posType === 'HDPOS') {
        logger.debug('Using HDPOS-specific receipt details query');
        return await HDPOSQueries.getReceiptDetails(pool, invoiceId);
      }

      // Use QuickBill queries if POS type is QUICKBILL
      if (posType === 'QUICKBILL') {
        logger.debug('Using QuickBill-specific receipt details query');
        return await QuickBillQueries.getItemDetails(pool, invoiceId);
      }

      // Generic queries for other POS systems
      logger.debug('Using generic receipt details query');

      // Main receipt query (without items)
      const mainQuery = `
        SELECT
          IsNull(ROUND(SalesInvoice.TaxGrandTotal, 2), 0) as TaxGrandTotal,
          IsNull(ROUND((SalesInvoice.ItemTotal - SalesInvoice.DiscountTotal),2), 0) as ItemTotalAmt,
          IsNull(SalesInvoice.ReceivedAmount-SalesInvoice.GrandTotal, 0) as ChangeDue,
          IsNull(SalesInvoice.DiscountTotal, 0)-IsNull(SalesInvoice.SpotDiscountAmount, 0) as OfferDiscount,
          IsNull(SalesInvoice.GrandTotal-SalesInvoice.TaxGrandTotal, 0) as BasicTotal,
          SalesInvoice.Creator,
          SalesInvoice.Date as InvoiceDate,
          IsNull(SalesInvoice.DiscountTotal, 0) as DiscountTotal,
          IsNull(ROUND(((SalesInvoice.DiscountTotal*100)/(SalesInvoice.GrandTotal+SalesInvoice.DiscountTotal)),2), 0) as DiscountTotalPer,
          IsNull(SalesInvoice.EarnedLoyaltyPoints, 0) as InvLP,
          IsNull(SalesInvoice.GrandTotal, 0) as GrandTotal,
          SalesInvoice.InvNumber as BillNumber,
          SalesInvoice.FreightAmount as DeliveryCharge,
          SalesInvoice.PackingAmount as PackagingCharge,
          IsNull(SalesInvoice.InvoiceLevelTax, 0) as InvoiceLevelTax,
          IsNull(SalesInvoice.CurrentLoyaltyPoints, 0) as CustLP,
          IsNull(SalesInvoice.ReceivedAmount, 0) as ReceivedAmount,
          IsNull(SalesInvoice.RoundOffAmount, 0) as RoundOffAmount,
          SalesInvoice.SalesType as PaymentType,
          SalesInvoice.TotalItemQty,
          SalesInvoice.NumberOfItems,
          BusinessLocation.LocationName,
          BusinessLocation.GSTNumber,
          BusinessLocation.ESICNumber as blzAPIKey,
          CashRegister.RegisterNumber as CRNumber,
          IsNull(Coupon.CouponNumber, 0) as CouponNumber,
          IsNull(CouponUsageHistory.DiscountAmount, 0) as CouponDiscount,
          Customer.Name as CustName,
          Customer.Firstname as FirstName,
          IsNull(Customer.LastName, '') as LastName,
          Contact.MobileNumber as CustMobile,
          IsNull(StoreCreditTransactions.DebitAmount, 0) as StoreCreditUsed,
          IsNull(SalesInvoice.TaxDetailString, '') as TaxDetailString,
          IsNull(SalesInvoice.PaymentDetailString, '') as PaymentDetailString
        FROM tbl_DYN_SalesInvoices as SalesInvoice WITH (NOLOCK)
        LEFT JOIN tbl_DYN_SalesInvoices_BusinessLocations as sibl WITH (NOLOCK)
          ON sibl.SalesInvoiceId = SalesInvoice.Id
        LEFT JOIN tbl_DYN_BusinessLocations as BusinessLocation WITH (NOLOCK)
          ON BusinessLocation.Id = sibl.BusinessLocationId
        LEFT JOIN tbl_DYN_SalesInvoices_Customers as sicust WITH (NOLOCK)
          ON sicust.SalesInvoiceId = SalesInvoice.id
        LEFT JOIN tbl_DYN_Customers as Customer WITH (NOLOCK)
          ON Customer.Id = sicust.CustomerId
        LEFT JOIN tbl_DYN_Customers_Addresses as CustomerAddress WITH (NOLOCK)
          ON CustomerAddress.CustomerId = Customer.id
        LEFT JOIN tbl_DYN_Addresses_Contacts as adcont WITH (NOLOCK)
          ON adcont.AddressId = CustomerAddress.AddressId
        LEFT JOIN tbl_DYN_Contacts as Contact WITH (NOLOCK)
          ON Contact.id = adcont.ContactId
        LEFT JOIN tbl_DYN_SalesInvoices_CashRegisters as sicr WITH (NOLOCK)
          ON sicr.SalesInvoiceId = SalesInvoice.Id
        LEFT JOIN tbl_DYN_CashRegisters as CashRegister WITH (NOLOCK)
          ON CashRegister.Id = sicr.CashRegisterId
        LEFT JOIN tbl_DYN_SalesInvoices_Coupons as sicoup WITH (NOLOCK)
          ON sicoup.SalesInvoiceId = SalesInvoice.Id
        LEFT JOIN tbl_DYN_Coupons as Coupon WITH (NOLOCK)
          ON Coupon.id = sicoup.CouponId
        LEFT JOIN tbl_DYN_CouponUsageHistories_SalesInvoices as cuhsi WITH (NOLOCK)
          ON cuhsi.SalesInvoiceId = SalesInvoice.id
        LEFT JOIN tbl_DYN_CouponUsageHistories as CouponUsageHistory WITH (NOLOCK)
          ON CouponUsageHistory.Id = cuhsi.CouponUsageHistoryId
        LEFT JOIN tbl_DYN_StoreCreditTransactions as StoreCreditTransactions WITH (NOLOCK)
          ON StoreCreditTransactions.DocumentIdNumber = SalesInvoice.Id
        WHERE SalesInvoice.Id = @invoiceId
      `;

      // Items query
      const itemsQuery = `
        SELECT
          ROW_NUMBER() OVER(Order by (SELECT NULL)) as SerialNumber,
          InvoiceItem.Name as ItemName,
          InvoiceItem.Quantity as Quantity,
          IsNull(InvoiceItem.MRP, 0) as MRP,
          ROUND(InvoiceItem.Price, 2) as FinalPrice,
          IsNull(ROUND(InvoiceItem.DiscountedAmount,2),0) as DiscountedAmount,
          IsNull(ROUND(InvoiceItem.TotalAmount, 2),0) as ItemTotalAmount,
          IsNull(ROUND((InvoiceItem.AdvanceTax1Percent+InvoiceItem.AdvanceTax2Percent+InvoiceItem.AdvanceTax3Percent+InvoiceItem.AdvanceTax4Percent+InvoiceItem.AdvanceTax5Percent+InvoiceItem.TaxPercent),1), 0) as TaxPercentage,
          IsNull(Item.HSNSAC,'') as HSN,
          InvoiceItem.Barcode
        FROM tbl_DYN_SalesInvoices as SalesInvoice WITH (NOLOCK)
        JOIN tbl_DYN_SalesInvoices_InvoiceItems as siit WITH (NOLOCK)
          ON siit.SalesInvoiceId = SalesInvoice.Id
        JOIN tbl_DYN_InvoiceItems as InvoiceItem WITH (NOLOCK)
          ON siit.InvoiceItemId = InvoiceItem.Id
        LEFT JOIN tbl_DYN_InvoiceItems_Items as iii WITH (NOLOCK)
          ON iii.InvoiceItemId = InvoiceItem.Id
        LEFT JOIN tbl_DYN_Items as Item WITH (NOLOCK)
          ON Item.Id = iii.ItemId
        WHERE SalesInvoice.Id = @invoiceId
      `;

      const mainResult = await pool.request().input('invoiceId', sql.VarChar, invoiceId).query(mainQuery);

      const itemsResult = await pool.request().input('invoiceId', sql.VarChar, invoiceId).query(itemsQuery);

      if (mainResult.recordset.length === 0) {
        return null;
      }

      return {
        main: mainResult.recordset[0],
        items: itemsResult.recordset
      };
    } catch (error) {
      logger.error('Error fetching receipt details:', error);
      throw error;
    }
  }

  isHealthy() {
    return this.isConnected && this.pool;
  }
}

// Singleton instance
const sqlConnector = new SQLConnector();

module.exports = sqlConnector;
