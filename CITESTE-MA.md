# Soft antrenori — etapa 1: Fundația

Ce e gata în etapa asta:

- **Cont de antrenor**: se înscrie singur, își pune numele și logo-ul, primește un link de invitare (și un cod de 6 caractere). Poate genera un link nou dacă cel vechi a ajuns unde nu trebuie.
- **Înscrierea clientului din link**: pagina arată numele și logo-ul antrenorului (nu COS FIT). Clientul își face cont și e legat automat de antrenorul lui. Un link greșit sau vechi e refuzat.
- **Datele separate**: fiecare antrenor vede doar clienții lui și datele lor; un client vede doar datele lui; antrenorul poate doar să citească datele clienților, nu să le modifice. Verificat cu 50 de teste (vezi la final).
- **Lista de clienți** a antrenorului: înscris când, ultima intrare, arhivare/reactivare (arhivații nu se vor număra la abonament, istoricul rămâne).
- **Intrare în cont** comună, cu „Am uitat parola”.
- Tabelele pentru plan (profil, planuri pe săptămână, greutate, rețete) sunt deja create, cu aceleași coloane ca în COS FIT, ca motorul de planuri să intre direct în etapa 2.

COS FIT nu e atins: proiect Supabase separat, cod separat.

## Ce e în arhivă

```
site/                 ← site-ul (asta publici pe Cloudflare Pages)
  index.html          intrare în cont + resetare parolă
  antrenor.html       înscriere antrenor + panoul lui
  inscriere.html      înscrierea clientului din link (?c=COD)
  client.html         contul clientului (planul vine în etapa 2)
  assets/config.js    ← aici pui datele proiectului Supabase
  assets/common.js, assets/app.css
supabase/
  01_fundatia.sql     ← rulezi o dată în proiectul Supabase nou
  test/               testele de izolare (nu se rulează în Supabase)
```

## Pași de instalare (circa 20 de minute)

### 1. Proiectul Supabase nou

1. Pe supabase.com → **New project**. Nume: de exemplu `soft-antrenori`.
2. **Region: Central EU (Frankfurt)**. Contează pentru GDPR: datele clienților rămân în UE.
3. Notează parola bazei de date undeva sigur (nu o pui în site).

### 2. Rulezi schema

1. În proiectul nou: **SQL Editor → New query**.
2. Deschide `supabase/01_fundatia.sql`, copiază tot, lipește, apasă **Run**.
3. Trebuie să vezi „Success. No rows returned”. În **Table Editor** apar `trainers`, `clients`, `meal_content`, `meal_profiles`, `meal_plans`, `body_weights`, fiecare cu RLS activ.

Fișierul se poate rula din nou fără probleme dacă îl actualizăm în etapele următoare.

### 3. Setările de conturi (Authentication)

1. **Authentication → Sign In / Providers → Email**: lasă **Confirm email** pornit. La **Minimum password length** pune `8`.
2. **Authentication → URL Configuration** (după ce ai adresa de la pasul 5, revii aici):
   - **Site URL**: adresa site-ului, de exemplu `https://soft-antrenori.pages.dev`
   - **Redirect URLs**: adaugă `https://soft-antrenori.pages.dev/**` și, pentru probe pe calculator, `http://localhost:8000/**`
3. **Emailurile în română** — Authentication → Emails → Templates:
   - *Confirm signup* — Subiect: `Confirmă-ți contul`. Text:
     `<p>Salut!</p><p>Apasă aici ca să-ți confirmi contul:</p><p><a href="{{ .ConfirmationURL }}">Confirm contul</a></p>`
   - *Reset password* — Subiect: `Parolă nouă`. Text:
     `<p>Ai cerut o parolă nouă. Apasă aici ca s-o alegi:</p><p><a href="{{ .ConfirmationURL }}">Aleg parola nouă</a></p><p>Dacă nu ai cerut tu, ignoră emailul.</p>`

**Important înainte de testul cu antrenori:** serverul de email inclus în Supabase trimite doar câteva emailuri pe oră și e făcut pentru probe. Pentru test cu clienți reali pune un serviciu de email propriu la **Authentication → Emails → SMTP Settings** (Resend sau Brevo au plan gratuit). Fără el, unii clienți nu vor primi emailul de confirmare.

### 4. Legi site-ul de Supabase

1. În Supabase: **Project Settings → API Keys**. Copiezi **Project URL** și cheia **Publishable** (începe cu `sb_publishable_`).
2. Le pui în `site/assets/config.js`. Cheia publishable e făcută să fie publică; protecția vine din regulile din baza de date. **Nu** pune cheia „secret” / „service_role”.

### 5. Publicarea (GitHub + Cloudflare Pages, ca la COS FIT)

1. Pe GitHub: repository nou, de exemplu `soft-antrenori` (poate fi privat). Urci tot conținutul arhivei.
2. Pe Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, alegi repository-ul.
3. La setări: *Framework preset*: **None**, *Build command*: gol, *Build output directory*: **`site`**. Așa se publică doar site-ul, nu și fișierele SQL.
4. După publicare primești o adresă `*.pages.dev`. O pui în Supabase la pasul 3.2.

Domeniul propriu îl legăm când alegi numele final.

### 6. Proba completă (10 minute)

1. Deschide `antrenor.html` și creează un cont de antrenor. Confirmă emailul.
2. Pune un logo, copiază link-ul de invitare.
3. Deschide link-ul într-o fereastră privată (incognito): trebuie să apară numele și logo-ul tău. Creează un cont de client cu alt email, confirmă-l.
4. Înapoi în contul de antrenor: clientul apare în listă, cu „ultima intrare: azi”. Arhivează-l și reactivează-l.
5. Creează al doilea cont de antrenor (alt email): nu trebuie să vadă clientul primului.
6. Apasă „Generează un link nou” și încearcă link-ul vechi: trebuie să spună că nu mai e valabil.

Pe calculator poți proba și fără să publici: în folderul `site` rulezi `python3 -m http.server 8000` și deschizi `http://localhost:8000/antrenor.html`.

## Testele de izolare

Am rulat schema pe un Postgres 16 local, cu autentificarea Supabase simulată (`supabase/test/`). Trec toate cele 50 de verificări, printre ele:

- un cod greșit nu creează cont; codul merge și scris cu litere mici sau cu spații;
- antrenorul A nu vede, nu arhivează și nu poate „muta” la el clienții antrenorului B;
- antrenorul vede greutatea, profilul și planul clienților lui, dar nu le poate modifica sau șterge;
- clientul nu își poate schimba antrenorul, nu se poate arhiva singur și nu poate scrie în datele altui client;
- fără cont nu se poate citi nimic, în afară de numele și logo-ul de pe pagina de înscriere;
- după un link nou, cel vechi nu mai merge, iar clienții deja înscriși rămân la antrenor.

## Ce vine în etapa 2

Contul clientului cu planul automat: calculatorul și preferințele, generatorul COS FIT cu cele 191 de rețete încărcate în `meal_content`, planul pe 7 zile refăcut săptămânal, bifarea meselor cu recalcularea zilei și ajustarea caloriilor după greutate.
