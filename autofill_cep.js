"use strict";

const URL_TRADUCOES = 'https://raw.githubusercontent.com/Muatsuu/CEP_OPERA/refs/heads/main/translateLabels.json';
const DEBUGGING_ATIVADO = true;

let traducoes = {};
let idIntervaloVerificacaoInputs = null;
let inputsEnderecoAtuais = null;
let listenerAnexado = false;

const Logger = {
    log: function(...args) {
        if (DEBUGGING_ATIVADO) {
            console.log("[CEP_OPERA]", ...args);
        }
    },
    error: function(...args) {
        if (DEBUGGING_ATIVADO) {
            console.error("[CEP_OPERA]", ...args);
        }
    }
};

async function buscarTraducoes(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro HTTP! Status: ${response.status}`);
        }
        traducoes = await response.json();
        Logger.log('Traduções carregadas com sucesso!', traducoes);
    } catch (error) {
        Logger.error('Erro ao carregar as traduções:', error);
    }
}

const CAMPOS_AUTO_PREENCHIMENTO = ['rua', 'bairro', 'complemento', 'numero'];

function normalizarString(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function consultarBrasilAPI(cep) {
    try {
        const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
        const data = await response.json();

        if (response.status === 404 || data.type === 'service_error' || data.type === 'validation_error') {
            Logger.log("CEP não encontrado pela BrasilAPI ou erro na consulta.");
            return null;
        }

        return {
            cep: normalizarString(data.cep),
            estado: normalizarString(data.state),
            cidade: normalizarString(data.city),
            bairro: normalizarString(data.neighborhood),
            rua: normalizarString(data.street),
            complemento: normalizarString(data.complemento || '') || null,
        };
    } catch (error) {
        Logger.error(`Erro ao consultar CEP na BrasilAPI: ${error.message}`);
        return null;
    }
}

function encontrarCampoInputPorLabel(textosPossiveisLabel, janela = window) {
    for (const textoLabel of textosPossiveisLabel) {
        const elementoLabel = Array.from(janela.document.querySelectorAll('label'))
            .find(el => el.textContent.trim() === textoLabel);

        if (elementoLabel) {
            if (elementoLabel.htmlFor) {
                return janela.document.getElementById(elementoLabel.htmlFor);
            }
            const inputAssociado = elementoLabel.querySelector('input') || elementoLabel.nextElementSibling;
            if (inputAssociado && inputAssociado.tagName === 'INPUT') {
                return inputAssociado;
            }
        }
    }
    return null;
}

function mostrarMensagemSucesso(texto, elementoPai, duracao) {
    let alertaExistente = document.getElementById('cep-opera-alert');
    if (alertaExistente) {
        alertaExistente.remove();
    }

    const elementoAlerta = document.createElement("div");
    elementoAlerta.id = 'cep-opera-alert';
    elementoAlerta.innerHTML = `<p>${texto}</p>`;
    elementoAlerta.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 20px;
        background: linear-gradient(120deg, #007BFF, #00D4BF);
        border-radius: 8px;
        border: 1px solid #ccc;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        z-index: 9999999999999;
        font-family: Arial, sans-serif;
        font-size: 16px;
        color: #ffffff;
        display: none;
    `;

    elementoPai.appendChild(elementoAlerta);
    elementoAlerta.style.display = "block";

    setTimeout(() => {
        elementoAlerta.remove();
    }, duracao);
}

function obterInputsFormularioEndereco(janela = window) {
    if (Object.keys(traducoes).length === 0) {
        Logger.log("Traduções ainda não carregadas, não é possível obter os inputs do formulário.");
        return null;
    }

    const inputs = {
        cep: encontrarCampoInputPorLabel(traducoes.cep, janela),
        rua: encontrarCampoInputPorLabel(traducoes.rua, janela),
        bairro: encontrarCampoInputPorLabel(traducoes.bairro, janela),
        cidade: encontrarCampoInputPorLabel(traducoes.cidade, janela),
        estado: encontrarCampoInputPorLabel(traducoes.estado, janela),
        complemento: encontrarCampoInputPorLabel(traducoes.complemento, janela),
        numero: encontrarCampoInputPorLabel(traducoes.numero, janela),
        janela: janela
    };

    if (inputs.cep && inputs.rua && inputs.numero) {
        return inputs;
    }
    return null;
}

async function tentarAutoPreencherEndereco(formularioInput) {
    const valorCep = formularioInput.cep.value.replace(/\D/g, '');

    if (valorCep.length === 8) {
        const dadosEndereco = await consultarBrasilAPI(valorCep);
        if (dadosEndereco) {
            Logger.log('Dados de endereço recebidos:', dadosEndereco);
            for (const campo of CAMPOS_AUTO_PREENCHIMENTO) {
                if (campo === 'numero') {
                    formularioInput.numero.value = (valorCep === '14027250') ? '780' : '';
                    Logger.log(`Campo 'numero' ${formularioInput.numero.value ? 'preenchido' : 'limpo'} para o CEP: ${valorCep}.`);
                } else if (dadosEndereco[campo] !== undefined && formularioInput[campo]) {
                    formularioInput[campo].value = dadosEndereco[campo];
                } else if (formularioInput[campo]) {
                    formularioInput[campo].value = "";
                }
            }
            mostrarMensagemSucesso('Feito!', document.body, 1000);
        }
    }
}

function configurarListenersEndereco() {
    let inputsEncontrados = null;

    inputsEncontrados = obterInputsFormularioEndereco(window);

    if (!inputsEncontrados) {
        for (let i = 0; i < window.frames.length; i++) {
            try {
                const inputsFrame = obterInputsFormularioEndereco(window.frames[i]);
                if (inputsFrame) {
                    inputsEncontrados = inputsFrame;
                    Logger.log('Encontrou os inputs de endereço em um iframe.');
                    break;
                }
            } catch (e) {
                Logger.log(`Não foi possível acessar o iframe ${i}: ${e.message}`);
            }
        }
    }

    if (inputsEncontrados && (!inputsEnderecoAtuais || inputsEncontrados.cep !== inputsEnderecoAtuais.cep)) {
        if (inputsEnderecoAtuais && inputsEnderecoAtuais.cep && listenerAnexado) {
            inputsEnderecoAtuais.cep.removeEventListener('input', inputsEnderecoAtuais.cep._manipuladorEvento);
            Logger.log("Listener de CEP antigo removido.");
            listenerAnexado = false;
        }

        inputsEnderecoAtuais = inputsEncontrados;
        inputsEnderecoAtuais.cep._manipuladorEvento = () => tentarAutoPreencherEndereco(inputsEnderecoAtuais);
        inputsEnderecoAtuais.cep.addEventListener('input', inputsEnderecoAtuais.cep._manipuladorEvento);
        listenerAnexado = true;
        Logger.log("Listener de CEP adicionado/reatribuído com sucesso.");
    } else if (!inputsEncontrados && listenerAnexado) {
        if (inputsEnderecoAtuais && inputsEnderecoAtuais.cep && inputsEnderecoAtuais.cep._manipuladorEvento) {
            inputsEnderecoAtuais.cep.removeEventListener('input', inputsEnderecoAtuais.cep._manipuladorEvento);
            Logger.log("Inputs de endereço desapareceram. Listener de CEP removido.");
        }
        inputsEnderecoAtuais = null;
        listenerAnexado = false;
    } else if (!inputsEncontrados) {
        Logger.log('Não localizou os inputs de endereço. Continuando a verificação...');
    }
}

async function inicializar() {
    await buscarTraducoes(URL_TRADUCOES);
    idIntervaloVerificacaoInputs = setInterval(configurarListenersEndereco, 2000);
    configurarListenersEndereco();
}

inicializar();
