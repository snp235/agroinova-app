import multer, { MulterError } from 'multer';
import path from 'path';
import fs from 'fs';
import type { RequestHandler } from 'express';

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
export function uploadSingle(field: string): RequestHandler {
  const mw = upload.single(field);
  return (req, res, next) => {
    mw(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
          ? 'Imagem muito grande (máximo 15 MB)'
          : err.message || 'Erro no upload da imagem';
        res.status(400).json({ error: msg });
        return;
      }
      const message = err instanceof Error ? err.message : 'Erro no upload da imagem';
      res.status(400).json({ error: message });
    });
  };
}
