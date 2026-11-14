import { configure } from 'quasar/wrappers'

export default configure(function (ctx) {
  return {
    boot: ['capacitor', 'pinia', ...(ctx.dev ? ['devSeed'] : [])],

    css: ['app.scss'],

    extras: [],

    build: {
      target: {
        browser: ['es2019'],
        node: 'node16'
      },
      vueRouterMode: 'hash'
    },

    devServer: {
      open: false
    },

    framework: {
      config: {
        dark: false
      },
      plugins: ['Notify', 'Dialog', 'Loading']
    },

    animations: [],

    capacitor: {
      hideSplashscreen: true
    }
  }
})
