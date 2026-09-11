-- Pronominer på profilen (#pronominer).
--
-- Medlemmet vælger dem selv: enten fra listen i appen eller som fritekst.
-- Kolonnen er fri tekst og ikke en enum, netop fordi listen aldrig bliver
-- komplet -- det, man selv skriver, skal kunne gemmes, som det er skrevet.
-- null betyder "ikke udfyldt endnu", og det er dét, appen minder om. Den, der
-- ikke vil oplyse noget, vælger det udtrykkeligt (se pronouns.ts i klienten),
-- så påmindelsen ikke bliver ved.
alter table public.profiles
  add column pronouns text
  constraint profiles_pronouns_length
    check (
      pronouns is null
      or (
        length(pronouns) between 1 and 40
        and pronouns = btrim(pronouns)
        and pronouns !~ '[\n\r\t]'
      )
    );

-- Tabel-update er trukket tilbage fra authenticated (#96), så profilens
-- redigerbare felter er en eksplicit kolonneliste. Uden den her ville feltet
-- kun kunne læses, ikke sættes. Læsning følger den eksisterende select-policy:
-- alle indloggede kan se hinandens pronominer, præcis som navn og farve.
grant update (pronouns)
  on table public.profiles
  to authenticated;

insert into public.feature_announcements (slug, title, body, path)
values (
  'profil-pronominer',
  'Fortæl de andre, hvad du gerne vil kaldes',
  'På din profil kan du nu vælge dine pronominer -- fx hun/hende, han/ham, de/dem eller hen/hen -- eller skrive dine egne. De vises ved dit navn på medlemslisten og i chatten, så ingen behøver at gætte -- og de andre får besked i chatten, når du vælger.',
  'profil'
)
on conflict (slug) do nothing;
