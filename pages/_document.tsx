import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/quakesettings/favicon.ico" />
        {/* Add unsafe-eval to the CSP */}
        <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-eval';" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}

