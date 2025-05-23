const express = require('express');
const bodyParser = require('body-parser');
const escpos = require('escpos');
const path = require('path');
const cors = require('cors');
const iconv = require('iconv-lite');

escpos.USB = require('escpos-usb');

const app = express();
const PORT = 3333;

app.use(bodyParser.json());
app.use(cors({
    origin: 'https://totem.ciedcomplexohospitalar.com.br',
    methods: ['POST'],
}));

// Função para converter texto para a codificação correta
function prepareText(text) {
    // Converter para a codificação que a Elgin I8 entende (CP860 para português)
    return iconv.encode(text, 'CP860');
}

function imprimirVia(printer, image, info) {
    const { dateStr, timeStr, code, tipoLabel, procedimento, profissional } = info;

    return printer
        .align('CT')
        .image(image, 'D24')
        .then(() => {
            printer
                .align('CT')
                .size(0, 0)
                .text(prepareText(dateStr + ' - ' + timeStr))
                .newLine()
                .style('B')
                .size(2, 2)
                .text(prepareText(`SENHA: ${code}`))
                .size(0, 0)
                .style('B')
                .text(prepareText(tipoLabel))
                .drawLine()
                .text(prepareText('Procedimento:'))
                .style('NORMAL')
                .text(prepareText(procedimento))
                .style('B')
                .text(prepareText('Profissional:'))
                .style('NORMAL')
                .text(prepareText(profissional))
                .drawLine()
                .newLine()
                .text(prepareText('Aguarde sua vez'))
                .text(prepareText('Obrigado pela visita!'))
                .newLine()
                .newLine()
                .text(prepareText('ATENCAOO: Entregar uma das vias na recepcao.'))
                .newLine()
                .cut();
        });
}

app.post('/print', async (req, res) => {
    const { code, type, procedimento, profissional, createdAt } = req.body;

    const device = new escpos.USB();
    const options = { encoding: 'CP860' };
    const printer = new escpos.Printer(device, options);

    const data = new Date(createdAt || Date.now());
    const dateStr = data.toLocaleDateString('pt-BR');
    const timeStr = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const tipoLabel = type === 'PREFERENCIAL' ? 'ATENDIMENTO PREFERENCIAL' : 'ATENDIMENTO NORMAL';

    const logoPath = path.join(__dirname, 'logo.png');

    try {
        escpos.Image.load(logoPath, image => {
            device.open(error => {
                if (error) {
                    console.error('Erro ao abrir a impressora:', error);
                    return res.status(500).send('Erro ao conectar à impressora');
                }

                const info = { dateStr, timeStr, code, tipoLabel, procedimento, profissional };

                // Imprimir 1ª via
                imprimirVia(printer, image, info)
                    // Imprimir 2ª via
                    .then(() => imprimirVia(printer, image, info))
                    // Finalizar
                    .then(() => printer.close(() => res.send('Duas vias impressas com sucesso')))
                    .catch(err => {
                        console.error('Erro ao imprimir:', err);
                        res.status(500).send('Erro ao imprimir');
                    });
            });
        });
    } catch (err) {
        console.error('Erro geral:', err);
        res.status(500).send('Erro no processo de impressão');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor de impressão rodando na porta ${PORT}`);
});