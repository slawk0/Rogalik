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
| Pauza | Esc |

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
