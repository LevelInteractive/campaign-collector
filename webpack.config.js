const path = require('path');
// const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');


module.exports = {
  entry: './src/campaign-collector.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'core.min.js',
    library: {
      name: 'CampaignCollector',
      type: 'umd',
      export: 'default'
    },
    globalObject: 'this'
  },
  target: ['web', 'es2020'],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          ecma: 2020,
          format: {
            comments: /@preserve|@license/i,
          }
        },
        extractComments: false
      }),
    ],
  },
  watch: true,
  watchOptions: {
    ignored: /node_modules/,
    aggregateTimeout: 300, // Delay before rebuilding
    poll: 1000 // Check for changes every second
  },
  // plugins: [
  //   new webpack.BannerPlugin({
  //     banner: `/*!\n * Package: Attributor\n * Version: 1.0.0\n * Author: Derek Cavaliero @ Level Agency\n */\n`,
  //     entryOnly: true,
  //     raw: true
  //   })
  // ],
};