import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const reportIndex = path.resolve(__dirname, '../allure-report/index.html')
const fileUrl = new URL(`file://${reportIndex}`).href
// eslint-disable-next-line no-console
console.log('\nAllure HTML（本地 file 链接，在浏览器地址栏打开）:\n' + fileUrl + '\n')
