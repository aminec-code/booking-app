El problema: ventanaInicial=4 pero maxDias=14 y expansion=2.
Cuando los primeros 4 días no tienen slots (por minimum notice de GHL),
la función expande: 4→6→8→10→12→14 días.
Por eso el lead de baja ve del 2 al 15 de abril (14 días).

Solución: bajar maxDias a 4 para que NUNCA se expanda más allá de 4 días.
O mejor: quitar la expansión completamente y dejar siempre 4 días fijos.
