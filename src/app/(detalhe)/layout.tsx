// Rotas de detalhe (/ofertas/[slug], /noticias/[slug], /monitoramento/comparar/[id]) ficam FORA de
// (shop) de propósito: (shop)/loading.tsx e os loading.tsx de ofertas/noticias/monitoramento criam
// um Suspense que faz o servidor enviar "200 OK" antes de notFound() rodar (soft-404). Sem loading.tsx
// acima, notFound() devolve HTTP 404 real. O shell visual é o mesmo de (shop).
export { default } from '../(shop)/layout';
