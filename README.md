# NAWIA — zejście w zaświaty

Turowy rogalik na heksach w klimacie słowiańskiego folkloru. Góral z ciupagą schodzi przez
**Mroczny Las** i **Bagna** do **Nawii**, żeby odebrać słońce skradzione przez Kościeja
Nieśmiertelnego. Jedna wyprawa trwa około 20 minut.

## Zasady w skrócie

Każdy ruch jest atakiem:

- **Cięcie** — przejdź obok wroga (sąsiaduje z Tobą przed i po ruchu): 1 obrażenie.
- **Wypad** — krok prosto w stronę wroga stojącego 2 pola dalej: 2 obrażenia.
- **Pchnięcie** — wejdź na wroga, a odleci o pole. Ściana albo inny wróg: 1 obrażenie.
  Woda, przepaść, lawa i krawędź wyspy: śmierć.
- **Skok** (PPM albo F) — skok o 2 pola; lądowanie odpycha wszystkich sąsiadów. Odnowienie 5 tur.

Najedź myszą na pole, żeby zobaczyć dokładne skutki ruchu: czaszka nad wrogiem oznacza, że zginie,
czerwone pole oznacza, że tam oberwiesz. Ataki wrogów ranią też innych wrogów.

Oczyść planszę, a dostaniesz dar od jednego z bogów (Perun, Swaróg, Strzybóg, Weles, Mokosz).
Schody pozwalają uciec wcześniej, ale bez daru. Trzy krainy po 4 poziomy i boss: Leszy, Baba Jaga
i Kościej, który jest nieśmiertelny, dopóki nie rozbijesz jego jaja.

## Sterowanie

| Akcja | Klawisz |
|---|---|
| Ruch / atak | klik na sąsiednie pole, albo Q W E / A S D |
| Skok | PPM na pole, albo F + kierunek |
| Czekaj | Spacja albo klik na bohatera |
| Pomoc | H |
| Dźwięk | M |
| Pauza / menu | Esc albo przycisk ≡ |

## Na telefonie

Gra działa w pionie i w poziomie.

- **Dotknij pola** obok bohatera, żeby się ruszyć. Ruch, po którym oberwiesz, wymaga drugiego dotknięcia
  (pole miga na czerwono).
- **Przytrzymaj palec** na polu, żeby zobaczyć skutki ruchu bez ruszania się; możesz przesuwać palec.
- Przyciski na dole: **SKOK** (potem dotknij pola) i **CZEKAJ**. Przycisk **≡** w rogu otwiera menu.
- Dotknięcie ikony daru pokazuje jego opis.
- W przeglądarce wybierz „Dodaj do ekranu głównego”, żeby grać na pełnym ekranie, bez paska adresu.

## Uruchomienie

```bash
npm install
npm run dev      # serwer deweloperski
npm run build    # jeden plik dist/index.html, działa bez serwera
npm test         # testy zasad gry
npm run sim      # bot rozgrywa wyprawy i liczy statystyki balansu
```

Grafika (pixel art w palecie Endesga 32), czcionka z polskimi znakami, efekty dźwiękowe i muzyka
są generowane w kodzie, bez zewnętrznych plików.

## Publikacja na GitHub Pages

Gotowy workflow jest w `deploy/github-pages.yml`. Skopiuj go do `.github/workflows/pages.yml`,
a w ustawieniach repozytorium wybierz **Settings → Pages → Source: GitHub Actions**. Każdy push na
`main` zbuduje grę i opublikuje ją pod adresem `https://<użytkownik>.github.io/Rogalik/`.
