# ⚠️ GitHub Secrets Setup Guide

## Krok 1: Przejdź do Settings

Otwórz link (zamień `JavsonOf` na swoją nazwę użytkownika):
```
https://github.com/JavsonOf/main/settings/secrets/actions
```

Lub:
1. Przejdź do repozytorium
2. Kliknij **Settings** (górny pasek)
3. Wybierz **Secrets and variables** → **Actions** (lewe menu)

---

## Krok 2: Dodaj 3 sekrety

### Secret #1: SUPABASE_URL
- Kliknij **New repository secret**
- **Name:** `SUPABASE_URL`
- **Value:** 
```
https://bnsfdjhpquvvpklqcibf.supabase.co
```
- Kliknij **Add secret**

### Secret #2: SUPABASE_ANON_KEY
- Kliknij **New repository secret**
- **Name:** `SUPABASE_ANON_KEY`
- **Value:** wklej swój `anon` key z Supabase Dashboard → Settings → API
  (⚠️ REDACTED — poprzednia wersja tego pliku zawierała tu prawdziwy klucz
  w postaci jawnego tekstu; ten klucz należy uznać za skompromitowany i
  natychmiast zregenerować w Supabase Dashboard)
- Kliknij **Add secret**

### Secret #3: SUPABASE_SERVICE_ROLE_KEY
- Kliknij **New repository secret**
- **Name:** `SUPABASE_SERVICE_ROLE_KEY`
- **Value:** wklej swój `service_role` key z Supabase Dashboard → Settings → API
  (⚠️ REDACTED — poprzednia wersja tego pliku zawierała tu prawdziwy klucz
  w postaci jawnego tekstu; ten klucz daje pełny dostęp do bazy danych i
  należy uznać go za skompromitowany — zregeneruj go natychmiast)
- Kliknij **Add secret**

---

## ✅ Po dodaniu sekretów

GitHub Actions Workflow automatycznie:
1. ✅ Pobierze kod
2. ✅ Zainstaluje zależności
3. ✅ Zbuduje projekt
4. ✅ Uruchomi serwer MCP

Możesz obserwować postęp w zakładce **Actions** w repozytorium.

---

## ⚠️ WAŻNE: ZAGROŻENIE BEZPIECZEŃSTWA

Te klucze API są **PUBLICZNE** na GitHubie! 

**ZARAZ PO TESTOWANIU:**
1. Regeneruj klucze w Supabase Dashboard
2. Zaktualizuj sekrety GitHub nowymi kluczami
3. Stare klucze już nie będą działać

---

## 🔒 Bezpieczne klucze (później)

Gdy będziesz mieć nowe klucze z Supabase:
1. Przejdź do Settings → Secrets → Actions
2. Dla każdego sekretu kliknij "Update secret"
3. Wstaw nową wartość
4. GitHub Actions będzie korzystać z nowych kluczy
