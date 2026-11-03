/** Reduz a foto no navegador: fotos de iPhone passariam do limite de envio das Server Actions. */
export async function resizeImage(file: File, maxSize = 512): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()

    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas indisponível')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao converter a imagem'))),
        'image/jpeg',
        0.85,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
