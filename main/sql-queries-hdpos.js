/**
 * HDPOS-specific SQL queries
 * These queries are designed for HD POS software with comprehensive joins
 * and detailed field mappings.
 */

const sql = require('mssql');

class HDPOSQueries {
  /**
   * Get recent receipts from HDPOS database
   * @param {*} pool - SQL connection pool
   * @param {number} limit - Maximum number of receipts to fetch
   * @param {string|Date} sinceDate - Optional date to fetch receipts after (if null, fetches last 24 hours)
   */
  static async getRecentReceipts(pool, limit = 50, sinceDate = null) {
    // Default to last 24 hours if no sinceDate provided
    const dateFilter = sinceDate
      ? `SalesInvoice.Date > @sinceDate`
      : `SalesInvoice.Date >= DATEADD(hour, -24, GETDATE())`;

    const query = `
      SELECT TOP ${limit}
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
      WHERE ${dateFilter}
      ORDER BY SalesInvoice.Date ASC
    `;

    const request = pool.request();
    if (sinceDate) {
      request.input('sinceDate', sql.DateTime, new Date(sinceDate));
    }

    const result = await request.query(query);
    return result.recordset;
  }

  /**
   * Get detailed receipt information from HDPOS database
   * Includes comprehensive customer, payment, and item details
   */
  static async getReceiptDetails(pool, invoiceId) {
    // Check if customer exists
    const customerCheckQuery = `
      SELECT
        Customer.Name as CustName,
        Customer.Firstname as FirstName,
        IsNull(Customer.LastName, '') as LastName,
        Contact.MobileNumber as CustMobile
      FROM tbl_DYN_SalesInvoices as SalesInvoice WITH (NOLOCK)
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
      WHERE SalesInvoice.Id = @invoiceId
    `;

    // Main receipt query (comprehensive HDPOS data)
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
        LoyaltyTransactions.ExpiryDate as ExpiryDate,
        IsNull(SalesInvoice.ReceivedAmount, 0) as ReceivedAmount,
        IsNull(SalesInvoice.RoundOffAmount, 0) as RoundOffAmount,
        SalesInvoice.SalesType as PaymentType,
        SalesInvoice.TotalItemQty,
        SalesInvoice.NumberOfItems,
        BusinessLocation.Address1,
        BusinessLocation.Address2,
        BusinessLocation.City,
        BusinessLocation.LandLineNumber,
        BusinessLocation.LocationName,
        BusinessLocation.GSTNumber,
        BusinessLocation.DocumentPrefix,
        BusinessLocation.MobileNumber,
        BusinessLocation.ESICNumber as blzAPIKey,
        CashRegister.RegisterName as CRName,
        CashRegister.RegisterNumber as CashRegisterNo,
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
      LEFT JOIN tbl_DYN_LoyaltyTransactions as LoyaltyTransactions WITH (NOLOCK)
        ON LoyaltyTransactions.DocumentIdNumber = SalesInvoice.Id
      WHERE SalesInvoice.Id = @invoiceId
    `;

    // Items query with comprehensive item details
    const itemsQuery = `
      SELECT
        ROW_NUMBER() OVER(Order by (SELECT NULL)) as SerialNumber,
        InvoiceItem.Name as ItemName,
        InvoiceItem.Name as ItemDescription,
        InvoiceItem.Quantity as Quantity,
        IsNull(InvoiceItem.MRP, 0) as MRP,
        ROUND(InvoiceItem.Price, 2) as FinalPrice,
        IsNull(ROUND(InvoiceItem.DiscountedAmount,2),0) as DiscountedAmount,
        IsNull(ROUND(InvoiceItem.TotalAmount, 2),0) as ItemTotalAmount,
        IsNull(ROUND((InvoiceItem.AdvanceTax1Percent+InvoiceItem.AdvanceTax2Percent+InvoiceItem.AdvanceTax3Percent+InvoiceItem.AdvanceTax4Percent+InvoiceItem.AdvanceTax5Percent+InvoiceItem.TaxPercent),1), 0) as TaxPercentage,
        IsNull(Item.HSNSAC, '') as HSN,
        InvoiceItem.Barcode,
        IsNull(ROUND(InvoiceItem.BasicPrice, 2), 0) as BasicPrice,
        IsNull(ROUND(InvoiceItem.PriceFromDB, 2), 0) as PriceFromDB
      FROM tbl_DYN_SalesInvoices as SalesInvoice WITH (NOLOCK)
      LEFT JOIN tbl_DYN_SalesInvoices_InvoiceItems as siit WITH (NOLOCK)
        ON siit.SalesInvoiceId = SalesInvoice.Id
      LEFT JOIN tbl_DYN_InvoiceItems as InvoiceItem WITH (NOLOCK)
        ON siit.InvoiceItemId = InvoiceItem.Id
      LEFT JOIN tbl_DYN_InvoiceItems_Items as iii WITH (NOLOCK)
        ON iii.InvoiceItemId = InvoiceItem.Id
      LEFT JOIN tbl_DYN_Items as Item WITH (NOLOCK)
        ON Item.Id = iii.ItemId
      WHERE SalesInvoice.Id = @invoiceId
    `;

    // Execute queries
    const customerResult = await pool.request()
      .input('invoiceId', sql.VarChar, invoiceId)
      .query(customerCheckQuery);

    const mainResult = await pool.request()
      .input('invoiceId', sql.VarChar, invoiceId)
      .query(mainQuery);

    const itemsResult = await pool.request()
      .input('invoiceId', sql.VarChar, invoiceId)
      .query(itemsQuery);

    if (mainResult.recordset.length === 0) {
      return null;
    }

    return {
      main: mainResult.recordset[0],
      items: itemsResult.recordset,
      customer: customerResult.recordset[0] || null
    };
  }
}

module.exports = HDPOSQueries;
