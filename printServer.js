const express = require('express');
const bodyParser = require('body-parser');
const escpos = require('escpos');
const path = require('path');
const cors = require('cors');

escpos.USB = require('escpos-usb');

const app = express();
const PORT = 3333;

app.use(bodyParser.json());
app.use(cors({
    origin: 'https://totem.ciedcomplexohospitalar.com.br',
    methods: ['POST'],
}));

app.post('/print', async (req, res) => {
    const { code, type, procedimento, profissional, createdAt } = req.body;

    const device = new escpos.USB();
    const options = { encoding: 'GB18030' };
    const printer = new escpos.Printer(device, options);

    const data = new Date(createdAt || Date.now());
    const dateStr = data.toLocaleDateString();
    const timeStr = data.toLocaleTimeString();
    const tipoLabel = type === 'PREFERENCIAL' ? 'ATENDIMENTO PREFERENCIAL' : 'ATENDIMENTO NORMAL';

    const logoPath = path.join(__dirname, 'logo.png');

    escpos.Image.load(logoPath, image => {
        device.open(() => {
            printer
                .align('CT')
                .image(image, 'D24')
                .then(() => {
                    printer
                        .align('CT')
                        .text(dateStr + ' - ' + timeStr)
                        .newLine()
                        .style('B')
                        .size(2, 2)
                        .text(`SENHA: ${code}`)
                        .size(1, 1)
                        .style('B')
                        .text(tipoLabel)
                        .drawLine()
                        .text('Procedimento:')
                        .style('NORMAL')
                        .text(procedimento)
                        .style('B')
                        .text('Profissional:')
                        .style('NORMAL')
                        .text(profissional)
                        .drawLine()
                        .newLine()
                        .text('Aguarde sua vez')
                        .text('Obrigado pela visita!')
                        .newLine()
                        .newLine()
                        .cut()
                        .close();
                });
        });
    });

    res.send('Impressão enviada');
});

app.listen(PORT, () => {
    console.log(`Servidor de impressão rodando na porta ${PORT}`);
});