# Multimodalne aplikacje AI — kurs po polsku

Praktyczny kurs budowania aplikacji, które rozumieją i generują **tekst, obraz, dźwięk i wideo**.
Przechodzimy od fundamentów (transformery, osadzenia, fuzja modalności), przez obraz, audio i wideo,
aż po wdrożenie produkcyjne, monitoring, ewaluację i skalowanie. Kurs kończy się projektem
**OmniTrainer** — multimodalnym trenerem obsługi klienta.

- **Poziom:** średniozaawansowany
- **Szacowany czas:** ok. 18–25 godzin (lekcje + ćwiczenia + projekt)
- **Liczba lekcji:** 45 w 8 modułach

## Wymagania wstępne

- Python na poziomie średniozaawansowanym (funkcje, klasy, `async`/`await`, środowiska wirtualne)
- Podstawy uczenia głębokiego i PyTorch
- Ogólna znajomość architektury Transformer i Hugging Face
- Podstawy inżynierii promptów i pracy z modelami bazowymi (foundation models)

## Spis treści

| Moduł | Temat | Lekcje |
|---|---|---|
| [1](01-wprowadzenie-i-podstawy/README.md) | Wprowadzenie i fundamenty multimodalnego AI | L1–L5 |
| [2](02-przetwarzanie-obrazu/README.md) | Przetwarzanie obrazu w przedsiębiorstwie | L6–L11 |
| [3](03-vision-transformers-i-dyfuzja/README.md) | Vision Transformers, modele wizja-język i dyfuzja | L12–L16 |
| [4](04-audio-podstawy-i-dzwieki/README.md) | Audio — reprezentacja, librosa i CLAP | L17–L21 |
| [5](05-mowa-i-moderacja-audio/README.md) | Mowa, inteligencja audio i moderacja głosu | L22–L27 |
| [6](06-wideo/README.md) | Rozumienie, moderacja i generowanie wideo | L28–L36 |
| [7](07-wdrozenie-i-produkcja/README.md) | Wdrożenie, monitoring, ewaluacja i skalowanie | L37–L44 |
| [8](08-projekt-omnitrainer/README.md) | Projekt końcowy — OmniTrainer | L45 |

## Przygotowanie środowiska

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -U google-genai pydantic pydantic-ai pydantic-evals \
    transformers datasets torch torchvision pillow \
    librosa soundfile matplotlib numpy \
    openai-whisper ultralytics opencv-python \
    gradio arize-phoenix python-dotenv
```

Klucz do Gemini API utworzysz w [Google AI Studio](https://aistudio.google.com/apikey).
**Nigdy nie wklejaj klucza do kodu ani do repozytorium** — trzymaj go w zmiennej środowiskowej
lub w pliku `.env` dodanym do `.gitignore`:

```bash
export GEMINI_API_KEY="..."        # lub wpis GEMINI_API_KEY=... w pliku .env
```

```python
from google import genai

client = genai.Client()  # automatycznie odczytuje GEMINI_API_KEY
odp = client.models.generate_content(model="gemini-2.5-flash", contents="Cześć! Czym jest multimodalne AI?")
print(odp.text)
```

Część przykładów (Whisper, SAM, YOLO, dyfuzja) działa szybciej na GPU — wygodnie uruchomić je
w Google Colab lub na maszynie z kartą NVIDIA.

## Jak korzystać z kursu

Każda lekcja ma tę samą budowę:

1. **Cele lekcji** — co będziesz umieć po jej ukończeniu.
2. **Teoria** — pojęcia, intuicje, porównania.
3. **Praktyka** — kompletny kod do uruchomienia.
4. **Ćwiczenie** — zadanie samodzielne z ukrytym rozwiązaniem.
5. **Quiz** — trzy pytania sprawdzające z odpowiedziami.
6. **Podsumowanie** i **Dalsza lektura**.

Najlepiej pracować po kolei. Moduły 2–6 da się też przerabiać wybiórczo, jeśli interesuje Cię
jedna modalność. Przed projektem końcowym ukończ Moduł 7.

## Koszty i odpowiedzialność

Wywołania płatnych API kosztują — w lekcjach pokazujemy, jak liczyć tokeny i ograniczać koszty.
Pracując z nagraniami głosu, obrazami osób czy wideo, pamiętaj o zgodach, RODO i ochronie danych
osobowych. Wątki etyczne (stronniczość modeli, prywatność, oznaczanie treści generowanych przez AI)
pojawiają się w kursie tam, gdzie mają praktyczne znaczenie.
