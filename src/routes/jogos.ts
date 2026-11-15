import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Todas as rotas usam req.userId: cada usuário só lê e grava o próprio progresso.

const JOGO_ID = /^[a-z0-9-]{1,40}$/;
const SESSAO_ID = /^[A-Za-z0-9-]{8,64}$/;
const RESULTADOS = ['vitoria', 'sem_jogadas', 'abandonada'];
const MAX_NIVEL = 50;
const MAX_INT = 2_000_000_000;

const inteiro = (v: unknown, max = MAX_INT): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null;

const lerNiveis = (texto: string): number[] =>
  texto.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);

const unirNiveis = (a: number[], b: number[]): string =>
  [...new Set([...a, ...b])].sort((x, y) => x - y).join(',');

function formatar(p: {
  recordePontos: number; maiorNivel: number; niveisDescobertos: string;
  partidasJogadas: number; partidasVencidas: number;
}) {
  return {
    recordePontos: p.recordePontos,
    maiorNivel: p.maiorNivel,
    niveisDescobertos: lerNiveis(p.niveisDescobertos),
    partidasJogadas: p.partidasJogadas,
    partidasVencidas: p.partidasVencidas,
  };
}

// GET /api/jogos/:jogoId/progresso — progresso do usuário logado (null se nunca jogou)
router.get('/:jogoId/progresso', requireAuth, async (req: AuthRequest, res: Response) => {
  const { jogoId } = req.params;
  if (!JOGO_ID.test(jogoId)) {
    res.status(400).json({ error: 'Jogo inválido' });
    return;
  }
  const p = await prisma.jogoProgresso.findUnique({
    where: { userId_jogoId: { userId: req.userId!, jogoId } },
  });
  res.json(p ? formatar(p) : null);
});

// PUT /api/jogos/:jogoId/progresso — junta o progresso enviado com o salvo.
// Fica sempre com o melhor de cada campo, então pode ser repetido sem risco
// (usado também para importar o progresso de quem jogou como visitante).
router.put('/:jogoId/progresso', requireAuth, async (req: AuthRequest, res: Response) => {
  const { jogoId } = req.params;
  const recorde = inteiro(req.body?.recordePontos);
  const maior = inteiro(req.body?.maiorNivel, MAX_NIVEL);
  const niveisBrutos: unknown = req.body?.niveisDescobertos;
  if (
    !JOGO_ID.test(jogoId) || recorde === null || maior === null ||
    !Array.isArray(niveisBrutos) || niveisBrutos.length > MAX_NIVEL ||
    niveisBrutos.some((n) => inteiro(n, MAX_NIVEL) === null || n === 0)
  ) {
    res.status(400).json({ error: 'Dados inválidos' });
    return;
  }
  const niveis = niveisBrutos as number[];
  const userId = req.userId!;

  try {
    const salvo = await prisma.$transaction(async (tx) => {
      const atual = await tx.jogoProgresso.findUnique({ where: { userId_jogoId: { userId, jogoId } } });
      const dados = {
        recordePontos: Math.max(atual?.recordePontos ?? 0, recorde),
        maiorNivel: Math.max(atual?.maiorNivel ?? 0, maior),
        niveisDescobertos: unirNiveis(lerNiveis(atual?.niveisDescobertos ?? ''), niveis),
      };
      return tx.jogoProgresso.upsert({
        where: { userId_jogoId: { userId, jogoId } },
        create: { userId, jogoId, ...dados },
        update: dados,
      });
    });
    res.json(formatar(salvo));
  } catch (err) {
    console.error('Erro ao salvar progresso do jogo:', err);
    res.status(500).json({ error: 'Não foi possível salvar o progresso' });
  }
});

// POST /api/jogos/:jogoId/sessoes — registra uma partida encerrada.
// O id vem do aparelho: reenviar a mesma partida não a conta duas vezes.
router.post('/:jogoId/sessoes', requireAuth, async (req: AuthRequest, res: Response) => {
  const { jogoId } = req.params;
  const b = req.body ?? {};
  const pontos = inteiro(b.pontos);
  const maiorNivel = inteiro(b.maiorNivel, MAX_NIVEL);
  const jogadas = inteiro(b.jogadas);
  const duracaoSegundos = inteiro(b.duracaoSegundos);
  const iniciadaEm = new Date(b.iniciadaEm);
  const encerradaEm = new Date(b.encerradaEm);
  if (
    !JOGO_ID.test(jogoId) || typeof b.id !== 'string' || !SESSAO_ID.test(b.id) ||
    pontos === null || maiorNivel === null || jogadas === null || duracaoSegundos === null ||
    !RESULTADOS.includes(b.resultado) ||
    Number.isNaN(iniciadaEm.getTime()) || Number.isNaN(encerradaEm.getTime())
  ) {
    res.status(400).json({ error: 'Dados inválidos' });
    return;
  }
  const userId = req.userId!;
  const id: string = b.id;

  try {
    const progresso = await prisma.$transaction(async (tx) => {
      const existente = await tx.jogoSessao.findUnique({ where: { id } });
      if (existente) {
        if (existente.userId !== userId) return null;
        return tx.jogoProgresso.findUnique({ where: { userId_jogoId: { userId, jogoId } } });
      }
      await tx.jogoSessao.create({
        data: {
          id, userId, jogoId, pontos, maiorNivel, jogadas, duracaoSegundos,
          resultado: b.resultado, iniciadaEm, encerradaEm,
        },
      });
      const atual = await tx.jogoProgresso.findUnique({ where: { userId_jogoId: { userId, jogoId } } });
      const venceu = b.resultado === 'vitoria' ? 1 : 0;
      const dados = {
        recordePontos: Math.max(atual?.recordePontos ?? 0, pontos),
        maiorNivel: Math.max(atual?.maiorNivel ?? 0, maiorNivel),
        partidasJogadas: (atual?.partidasJogadas ?? 0) + 1,
        partidasVencidas: (atual?.partidasVencidas ?? 0) + venceu,
      };
      return tx.jogoProgresso.upsert({
        where: { userId_jogoId: { userId, jogoId } },
        create: { userId, jogoId, ...dados },
        update: dados,
      });
    });
    if (!progresso) {
      res.status(409).json({ error: 'Partida já registrada' });
      return;
    }
    res.status(201).json(formatar(progresso));
  } catch (err) {
    console.error('Erro ao registrar partida do jogo:', err);
    res.status(500).json({ error: 'Não foi possível registrar a partida' });
  }
});

export default router;
