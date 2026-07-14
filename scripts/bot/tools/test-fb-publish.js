const publisher = require('./publisher.js')
const path = require('path')
const SCENES_DIR = path.join(__dirname, 'downloads', 'scenes')

async function testFB() {
  try {
    const imgPath = path.join(SCENES_DIR, 'portada_2026-07-08.png')
    const postText = 'Prueba FB'
    const id = await publisher.publishImageToFacebook(imgPath, postText)
    console.log('Exito:', id)
  } catch (e) {
    console.error('Error Facebook:', e.response ? JSON.stringify(e.response.data, null, 2) : e.message)
  }
}
testFB()
