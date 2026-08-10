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
- **Value:** 
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuc2ZkamhwcXV2dnBrbHFjaWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNzY5NTksImV4cCI6MjEwMTk1Mjk1OX0.bB3yTulT9d6JK3rR_Rfg9BySJQS0iVK8A1u5cebXtSo
```
- Kliknij **Add secret**

### Secret #3: SUPABASE_SERVICE_ROLE_KEY
- Kliknij **New repository secret**
- **Name:** `SUPABASE_SERVICE_ROLE_KEY`
- **Value:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuc2ZkamhwcXV2dnBrbHFjaWJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM3Njk1OSwiZXhwIjoyMTAxOTUyOTU5fQ.opsI8E-e08DbZGd3wqx19svX_w22MivGgeAr7Y8h2t4
```
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
