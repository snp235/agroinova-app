import multer, { MulterError } from 'multer';
import path from 'path';
import fs from 'fs';
import type { RequestHandler } from 'express';
// @ts-expect-error — heic-convert não tem tipos publicados, mas exporta default
import heicConvert from 'heic-convert';

const uploadsDir = process.env.UPLOADS_DIR || './uploads';
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Apenas arquivos de imagem são permitidos'));
  }
};

export const upload = multer({ storage, fileFilter, limits: { fileSize: 15 * 1024 * 1024 } });

// Wrapper que captura erros do multer (formato inválido, tamanho, etc.)
// e devolve JSON 400 em vez de propagar para o handler default do Express
// (que retornaria 500 com HTML — fazendo o frontend mostrar "Erro na requisição").
// Converte HEIC/HEIF para JPEG depois do upload, in-place. iOS continua mandando
// HEIC mesmo quando o usuário tira a foto pela web — Chrome desktop e a maioria
// dos browsers não renderizam HEIC, então a foto fica "quebrada" no feed.
async function convertHeicIfNeeded(file: Express.Multer.File): Promise<void> {
  const isHeic = file.mimetype === 'image/heic'
    || file.mimetype === 'image/heif'
    || /\.(heic|heif)$/i.test(file.originalname);
  if (!isHeic) return;

  const inputBuffer = fs.readFileSync(file.path);
  const outputBuffer = await heicConvert({ buffer: inputBuffer, format: 'JPEG', quality: 0.85 });

  const finalPath = /\.(heic|heif)$/i.test(file.path)
    ? file.path.replace(/\.(heic|heif)$/i, '.jpg')
    : `${file.path}.jpg`;
  fs.writeFileSync(finalPath, outputBuffer);
  if (finalPath !== file.path) fs.unlinkSync(file.path);

  file.path = finalPath;
  file.filename = path.basename(finalPath);
  file.mimetype = 'image/jpeg';
}

export function uploadSingle(field: string): RequestHandler {
  const mw = upload.single(field);
  return (req, res, next) => {
    mw(req, res, async (err: unknown) => {
      if (err) {
        if (err instanceof MulterError) {
          const msg = err.code === 'LIMIT_FILE_SIZE'
            ? 'Imagem muito grande (máximo 15 MB)'
            : err.message || 'Erro no upload da imagem';
          res.status(400).json({ error: msg });
          return;
        }
        const message = err instanceof Error ? err.message : 'Erro no upload da imagem';
        res.status(400).json({ error: message });
        return;
      }

      if (req.file) {
        try {
          await convertHeicIfNeeded(req.file);
        } catch (convErr) {
          console.error('[upload] HEIC conversion failed', convErr);
          // Não bloqueia: arquivo original fica salvo (ainda pode ser baixado, só não renderiza inline)
        }
      }
      next();
    });
  };
}
