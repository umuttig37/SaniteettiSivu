const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const subjectText = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim()

const customerConfirmationHtml = (record) => `
<div style="font-family:Arial,Helvetica,sans-serif;color:#13233f;line-height:1.5;">
  <h2 style="margin:0 0 12px;">Laskuvertailupyynt&ouml; vastaanotettu</h2>
  <p style="margin:0 0 12px;">Hei ${escapeHtml(record.contactName)}!</p>
  <p style="margin:0 0 12px;">Kiitos, vastaanotimme yrityksen <strong>${escapeHtml(record.company)}</strong> laskun.</p>
  <p style="margin:0 0 12px;">K&auml;ymme laskun tuotteet ja hinnat l&auml;pi ja palaamme sinulle mahdollisimman pian merkitt&auml;v&auml;sti edullisemman tarjouksen kanssa samoista tai vastaavista tuotteista.</p>
  <p style="margin:0;">Vertailu on ilmainen eik&auml; sido mihink&auml;&auml;n.</p>
  <p style="margin:20px 0 0;">Yst&auml;v&auml;llisin terveisin,<br /><strong>Suomen Paperitukku</strong><br />info@suomenpaperitukku.fi<br />+358 44 978 2446</p>
</div>
`

const merchantNotificationHtml = (record) => `
<div style="font-family:Arial,Helvetica,sans-serif;color:#13233f;line-height:1.5;">
  <h2 style="margin:0 0 12px;">Uusi laskuvertailupyynt&ouml;</h2>
  <p style="margin:0 0 8px;"><strong>Yritys:</strong> ${escapeHtml(record.company)}</p>
  <p style="margin:0 0 8px;"><strong>Yhteyshenkil&ouml;:</strong> ${escapeHtml(record.contactName)}</p>
  <p style="margin:0 0 8px;"><strong>S&auml;hk&ouml;posti:</strong> ${escapeHtml(record.email)}</p>
  <p style="margin:0 0 8px;"><strong>Puhelin:</strong> ${escapeHtml(record.phone)}</p>
  <p style="margin:0 0 8px;"><strong>Viesti:</strong> ${escapeHtml(record.message || '-')}</p>
  <p style="margin:0 0 8px;"><strong>Pyynt&ouml;tunnus:</strong> ${escapeHtml(record.id)}</p>
  <p style="margin:0 0 8px;"><strong>Saapui:</strong> ${escapeHtml(record.createdAt)}</p>
  <p style="margin:16px 0 0;">Asiakkaan l&auml;hett&auml;m&auml; lasku on viestin liitteen&auml;.</p>
</div>
`

export const createInvoiceComparisonMailMessages = ({ record, attachmentPath, from, notificationEmail }) => [
  {
    from,
    to: record.email,
    subject: 'Laskuvertailupyyntö vastaanotettu | Suomen Paperitukku',
    html: customerConfirmationHtml(record),
  },
  {
    from,
    to: notificationEmail,
    subject: `Uusi laskuvertailupyyntö: ${subjectText(record.company)}`,
    html: merchantNotificationHtml(record),
    attachments: [
      {
        filename: record.attachment.originalName,
        path: attachmentPath,
        contentType: record.attachment.mimeType,
      },
    ],
  },
]
