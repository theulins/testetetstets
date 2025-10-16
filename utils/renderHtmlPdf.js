// backend/utils/renderHtmlPdf.js
import fs from 'fs';
import path from 'path';
import Mustache from 'mustache';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function renderHtmlToPdf(templatePath, data, outPath) {
  // Confere se o template existe e é legível
  await fs.promises.access(templatePath, fs.constants.R_OK).catch(() => {
    throw new Error(`[renderHtmlToPdf] Template não encontrado ou sem permissão: ${templatePath}`);
  });

  // Renderiza HTML e salva um arquivo de debug (útil para abrir no navegador em caso de erro)
  const tpl = await fs.promises.readFile(templatePath, 'utf8');
  const html = Mustache.render(tpl, data);

  const tmpDir = path.join(__dirname, '../storage/tmp');
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const debugHtml = path.join(tmpDir, 'last_proposta.html');
  await fs.promises.writeFile(debugHtml, html, 'utf8');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      // Se precisar usar um Chrome já instalado:
      // executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');

    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' }
    });
  } catch (err) {
    throw new Error(
      `[renderHtmlToPdf] Falhou ao gerar PDF (${outPath}). ` +
      `Abra o HTML de debug: ${debugHtml}\nErro: ${err.message}`
    );
  } finally {
    if (browser) await browser.close();
  }

  // Confere se o PDF foi gravado
  await fs.promises.access(outPath, fs.constants.R_OK).catch(() => {
    throw new Error(`[renderHtmlToPdf] PDF não foi escrito em disco: ${outPath}`);
  });
}
