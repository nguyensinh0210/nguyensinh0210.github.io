/* Made-up sample data for the demo. No real accounts, companies' records or people. */
(function (root) {
  'use strict';
  const statement = rows => ['Date,Description,Debit,Credit,Balance'].concat(rows).join('\n');
  const base = [
    '2025-02-01,Opening balance,,,5000.00',
    '2025-02-02,Rent payment,1200.00,,3800.00',
    '2025-02-03,Customer receipt A,,2450.00,6250.00',
    '2025-02-04,Supplier Orion,865.00,,5385.00',
    '2025-02-05,Customer receipt B,,1320.00,6705.00',
    '2025-02-06,Payroll,2100.00,,4605.00',
    '2025-02-07,Customer receipt C,,940.00,5545.00'
  ];
  const swap = (i, line) => base.map((r, j) => (j === i ? line : r));

  const data = {
    mapping: [
      {
        name: 'Messy bank export',
        text: [
          'Txn Dt;Value Dt;Narration;Chq/Ref No;Withdrawal Amt;Deposit Amt;Bank Charges;Closing Bal',
          '03/01/2025;03/01/2025;Opening balance;;;;;12.500,00',
          '05/01/2025;06/01/2025;Cheque paid to Rentco;100231;1.250,00;;;11.250,00',
          '09/01/2025;09/01/2025;Transfer from Northwind Trading;TX88213;;3.480,50;;14.730,50',
          '13/01/2025;13/01/2025;Card payment Globex Supplies;TX88377;(865,00);;2,50;13.865,50',
          '21/01/2025;22/01/2025;Deposit Initech;TX88902;;2.750,00 CR;;16.615,50',
          '28/01/2025;28/01/2025;Monthly account fee;;25,00;;;16.590,50'
        ].join('\n')
      },
      {
        name: 'Headers that say nothing',
        text: [
          'Col1,Col2,Col3,Col4,Col5',
          '02/01/2025,Rent payment,"($1,200.00)",100231,"$3,800.00"',
          '03/01/2025,Customer receipt A,"$2,450.00",100232,"$6,250.00"',
          '07/01/2025,Supplier Orion,($865.00),100240,"$5,385.00"',
          '01/02/2025,Customer receipt B,"$1,320.00",100251,"$6,705.00"'
        ].join('\n')
      },
      {
        name: 'Tidy export',
        text: [
          'Date,Description,Debit,Credit,Balance,Ref No',
          '2025-01-01,Opening balance,,,1000.00,',
          '2025-01-02,Invoice INV001,250.00,,750.00,TX001',
          '2025-01-03,Salary,,5000.00,5750.00,TX002',
          '2025-01-04,Office supplies,120.50,,5629.50,TX003'
        ].join('\n')
      }
    ],
    balance: [
      { name: 'Two digits swapped in a balance', text: statement(swap(3, '2025-02-04,Supplier Orion,865.00,,5835.00')) },
      { name: 'Receipt entered as a payment', text: statement(swap(4, '2025-02-05,Customer receipt B,1320.00,,6705.00')) },
      { name: 'Two digits swapped in an amount', text: statement(swap(3, '2025-02-04,Supplier Orion,856.00,,5385.00')) },
      { name: 'A row entered twice', text: statement(base.slice(0, 4).concat(['2025-02-04,Supplier Orion,865.00,,5385.00'], base.slice(4))) },
      { name: 'A row left out', text: statement(base.filter((r, i) => i !== 4)) },
      { name: 'No errors', text: statement(base) }
    ],
    recon: {
      opening: 10000,
      bank: [
        'Date,Description,Reference,Amount',
        '2025-03-03,ACME PTY LTD INV-2041,INV-2041,4200.00',
        '2025-03-04,CHQ 100231,100231,-1250.00',
        '2025-03-05,TRANSFER NORTHWIND TRADING,,980.50',
        '2025-03-06,DEPOSIT BATCH,,3500.00',
        '2025-03-07,GLOBEX SUPPLIES,,-1860.00',
        '2025-03-10,PAYMENT INITECH,SO-55812-A,2750.00',
        '2025-03-12,MONTHLY ACCOUNT FEE,,-25.00',
        '2025-03-14,INTEREST CREDITED,,12.40',
        '2025-03-17,CHQ RETURNED UNPAID UMBRELLA CO,,-640.00',
        '2025-03-18,STARK IND,,1500.00',
        '2025-03-20,DIRECT DEBIT CITY POWER,,-310.00'
      ].join('\n'),
      book: [
        'Date,Description,Reference,Amount',
        '2025-03-01,Acme invoice 2041,INV-2041,4200.00',
        '2025-03-02,Cheque to Rentco,100231,-1250.00',
        '2025-03-05,Northwind Trading,,980.50',
        '2025-03-06,Cash sales till 1,,1300.00',
        '2025-03-06,Cash sales till 2,,2200.00',
        '2025-03-07,Globex Supplies,,-1680.00',
        '2025-03-09,Initech order,SO-55812,2750.00',
        '2025-03-15,Stark Industries,,1500.00',
        '2025-03-19,Cheque to Wayne Ent,100245,-890.00',
        '2025-03-20,Hooli receipt,RC-9004,2100.00',
        '2025-03-09,Initech order,SO-55812,2750.00'
      ].join('\n')
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.DemoData = data;
})(typeof window !== 'undefined' ? window : globalThis);
