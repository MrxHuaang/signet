# Signet

Dibuja tu firma con el dedo, el mouse o un lápiz y descárgala lista para pegar en Word, Google Docs o un PDF.

**[signet-firma.vercel.app](https://signet-firma.vercel.app)**

## Qué hace

- **Trazo con tinta real.** El grosor cambia con la velocidad, con curvas Bézier suavizadas ([signature_pad](https://github.com/szimek/signature_pad)). Funciona con mouse, dedo y lápiz (pointer events, sin scroll accidental en móvil).
- **Área amplia.** El botón de ampliar lleva el área de firma a pantalla completa; al volver, la firma se conserva sobre la línea.
- **Recorte automático.** La descarga se ajusta a la tinta con un pequeño margen, sin espacio vacío.
- **Exportación nítida.** PNG transparente a 4x, PNG con fondo blanco, SVG vectorial o copiar al portapapeles.
- **Tinta y trazo** (negra, azul, café; fino, medio, grueso) se aplican a toda la firma al instante.
- **Deshacer** con el botón o `Ctrl` + `Z`.
- **Privada.** Todo ocurre en el navegador; la firma no se sube a ningún servidor.
- Respeta `prefers-reduced-motion`.

## Desarrollo

```bash
npm install
npm run dev
```

```bash
npm run build
```

Vite + TypeScript, sin framework. Iconos de [Phosphor](https://phosphoricons.com), tipografía [Geist](https://vercel.com/font).

---

Diseño y desarrollo por [Juan Ordóñez](https://juanordonezvercelapp.vercel.app).
