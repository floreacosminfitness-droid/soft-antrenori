// Proiectul Supabase „soft-antrenori” (Frankfurt), separat de COS FIT.
// Cheia „publishable” e făcută să fie publică; protecția vine din regulile din baza de date.
// NU pune aici cheia „secret” / „service_role”.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://plipammdzvjgsefdhukr.supabase.co',
  SUPABASE_KEY: 'sb_publishable_WiKMezPgcwNIUJQSQRIUSA_0jbS8d0w',
  APP_NAME: 'COS FIT Pro', // nume de lucru, până alegi numele final
  // Linkurile de plată Stripe (Payment Links), câte unul pe plan și perioadă. Sunt publice.
  PAYMENT_LINKS: {
    start:  { month: 'https://buy.stripe.com/28EaEWaDvfJfgUmc8mcMM1h', year: 'https://buy.stripe.com/eVq6oGeTL9kRcE6dcqcMM1i' },
    pro:    { month: 'https://buy.stripe.com/7sYbJ06nf1Sp1Zsc8mcMM1j', year: 'https://buy.stripe.com/4gM5kCdPHdB7gUmegucMM1k' },
    studio: { month: 'https://buy.stripe.com/5kQ5kCbHzfJf0Vo5JYcMM1l', year: 'https://buy.stripe.com/cNifZg6nf1Sp7jMegucMM1m' }
  },
  // Pagina Stripe unde antrenorul își schimbă cardul, planul sau anulează (Customer portal → link de intrare).
  BILLING_PORTAL: 'https://billing.stripe.com/p/login/14A00i7rj9kRfQib4icMM00'
};
