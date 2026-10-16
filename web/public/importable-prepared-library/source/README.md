# Independent packed-library consumer

This app was built outside the Manifold checkout from the adjacent
`manifold-author-0.1.0.tgz`. Download that tarball and these source files into a
new directory. Then install and run with your normal browser bundler:

```sh
npm install ./manifold-author-0.1.0.tgz
npm install --save-dev vite typescript
npx vite --host 0.0.0.0
```

Configure your server to send `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` on the document and compiler Worker.
For Vite, set both `server.headers` and `preview.headers` to those values.
HTTPS or localhost is required for AudioWorklet.

`app.js` imports the public browser host and DspLiveScripting composer. Start
creates the authored graph, Insert Distortion edits its topology while sounding,
and Stop awaits host ownership release. `consumer.ts` demonstrates strict
TypeScript diagnostic narrowing and asynchronous close.

The retained package manifest/lock records the original temporary-directory
installation. Replace that local tarball path with your downloaded copy.
