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

// Lista de procedimentos que necessitam do recibo de entrega.
// Usamos letras minúsculas para facilitar a comparação.
const procedimentosComRecibo = [
    'setor de imagem',
    'densitometria ossea', // Nome mais completo
    'raio-x',
    'mamografia',
    'holter',
    'eletrocardiograma',
    'ultrasonografia' // Nome mais completo
];

// Função para converter texto para a codificação correta
function prepareText(text) {
    // Converter para a codificação que a Elgin I8 entende (CP860 para português)
    return iconv.encode(text, 'cp860');
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
                .text(prepareText('ATENCAO: Entregar uma das vias na recepcao.'))
                .newLine()
                .cut();
        });
}

// --- NOVA FUNÇÃO PARA O RECIBO DE ENTREGA ---
function imprimirReciboEntrega(printer, image, info) {
    const { procedimento } = info;

    // Se for 'Setor de Imagem', o campo vai em branco. Caso contrário, imprime o nome do procedimento.
    const isSetorDeImagem = procedimento.toLowerCase().includes('setor de imagem');
    const nomeExameParaImprimir = isSetorDeImagem ? '' : procedimento;

    return printer
        .align('CT')
        .image(image, 'D24') // Usa a mesma logo
        .then(() => {
            printer
                .newLine()
                .style('B')
                .size(1, 1)
                .text(prepareText('CONFIRMACAO DE ENTREGA'))
                .size(0, 0)
                .style('NORMAL')
                .drawLine()
                .align('LT') // Alinha à esquerda para os campos
                .newLine()
                .text(prepareText('Exame Realizado:'))
                .style('B')
                .text(prepareText(nomeExameParaImprimir))
                .style('NORMAL');

            // Se for setor de imagem, deixa um espaço maior para preenchimento manual
            if (isSetorDeImagem) {
                printer.text(prepareText('___________________________________'));
            }

            printer
                .newLine()
                .newLine()
                .text(prepareText('Assinatura do Paciente:'))
                .text(prepareText('___________________________________'))
                .newLine()
                .newLine()
                .align('CT')
                .drawLine()
                .style('B')
                .text(prepareText('OBSERVACAO IMPORTANTE:'))
                .style('NORMAL')
                .text(prepareText('E obrigatorio apresentar este recibo'))
                .text(prepareText('para a retirada do seu exame.'))
                .newLine()
                .newLine()
                .cut(); // Corta o papel para este recibo
        });
}


app.post('/print', async (req, res) => {
    const { code, type, procedimento, profissional, createdAt } = req.body;

    const device = new escpos.USB();
    const options = { encoding: 'cp860' };
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

                // --- LÓGICA DE IMPRESSÃO ATUALIZADA ---

                // Verifica se o procedimento recebido requer um recibo.
                // A verificação é flexível (toLowerCase e includes)
                const procedimentoLowerCase = procedimento.toLowerCase();
                const precisaRecibo = procedimentosComRecibo.some(p => procedimentoLowerCase.includes(p));

                // Inicia a cadeia de impressão com as duas vias padrão
                let promiseChain = imprimirVia(printer, image, info)
                    .then(() => imprimirVia(printer, image, info));

                // Se o procedimento exigir, adiciona a impressão do recibo à cadeia
                if (precisaRecibo) {
                    promiseChain = promiseChain.then(() => imprimirReciboEntrega(printer, image, info));
                }

                // Anexa o fechamento da impressora e a resposta ao final da cadeia
                promiseChain
                    .then(() => {
                        printer.close(() => {
                            res.send('Impressão concluída com sucesso');
                        });
                    })
                    .catch(err => {
                        console.error('Erro ao imprimir:', err);
                        res.status(500).send('Erro ao imprimir');
                        printer.close(); // Tenta fechar a impressora mesmo em caso de erro
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