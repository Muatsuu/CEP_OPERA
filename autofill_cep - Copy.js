"use strict";

const translationsUrl = 'https://raw.githubusercontent.com/Geanderson-Ferreira/cepex/refs/heads/main/translateLabels.json';

let translations = {};

// true para visualizar log no console do navegador
const DEBUGGING_ON_CONSOLE = true;

// Função básica de log
const log = {
    log: function(msg){
        if (DEBUGGING_ON_CONSOLE){
            console.log(msg);
        }
    }
};

/**
 * Busca as traduções de rótulos de uma URL.
 * @param {string} url - A URL do arquivo JSON de traduções.
 */
async function fetchTranslations(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Erro na resposta da API ao buscar traduções.');
        }
        
        translations = await response.json();

        log.log('Traduções carregadas com sucesso!', translations);
    } catch (error) {
        // Usar console.error para erros
        console.error('Erro ao carregar as traduções:', error);
    }
}

/**
 * Inicializa a extensão: carrega traduções e inicia a verificação dos inputs.
 */
async function initialize() {
    await fetchTranslations(translationsUrl); // Aguarda carregar as traduções
    log.log("Inicializando intervalo para verificar inputs...");
    // Verifica os inputs a cada 4 segundos
    setInterval(loopWindowAndFramesAndCheckInputs, 4000); 
}

// Opções de campos para preenchimento automático: "rua", "bairro", "cidade", "estado", "complemento"
// Sempre em lowerCase()
const fieldsYouWantToAutoFill = ['rua', 'bairro', 'complemento'];

/**
 * Normaliza uma string, removendo acentos e caracteres especiais.
 * @param {string} string_text - O texto a ser normalizado.
 * @returns {string} O texto normalizado.
 */
function normalizeString(string_text){
    return string_text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Consulta a API ViaCEP para obter dados de endereço.
 * @param {string} cep - O CEP a ser consultado.
 * @returns {Promise<object|null>} Um objeto com os dados do endereço ou null se o CEP não for encontrado ou houver erro.
 */
async function consultarCEP(cep) {
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (data.erro) {
            log.log("CEP não encontrado pela ViaCEP.");
            return null; // Retorna null em caso de erro no CEP
        }

        const endereco = {
            cep: normalizeString(data.cep),
            estado: normalizeString(data.uf),
            cidade: normalizeString(data.localidade),
            bairro: normalizeString(data.bairro),
            rua: normalizeString(data.logradouro),
            complemento: normalizeString(data.complemento) || null, // Complemento pode ser nulo
        };

        return endereco;
    } catch (error) {
        log.log(`Erro ao consultar CEP: ${error.message}`);
        return null; // Retorna null em caso de erro na requisição
    }
}

/**
 * Busca um elemento no DOM pelo seletor e por um trecho do seu ID.
 * Esta função não é mais usada para o HOTEL_ID, mas é mantida por segurança caso seja relevante para outros elementos.
 * @param {string} selector - O seletor CSS (ex: 'span', 'input').
 * @param {string[]} possibleText - Array de trechos de texto que o ID do elemento pode conter.
 * @param {Window} [win=window] - A janela (window ou iframe) onde buscar o elemento.
 * @returns {HTMLElement|boolean} O elemento encontrado ou false se não for encontrado.
 */
function querySelectorByIdIncludesText (selector, possibleText, win = window){
    for (let text of possibleText){
        let resultado = Array.from(win.document.querySelectorAll(selector)).find(el => el.id.includes(text)) || false;
        if (resultado){
            return resultado;
        }
    }
    return false;
}

/**
 * Encontra um campo de input associado a um label com textos específicos.
 * @param {string[]} possibleLabels - Array de textos que o label pode conter.
 * @param {Window} [win=window] - A janela (window ou iframe) onde buscar o label.
 * @returns {HTMLInputElement|boolean} O input element associado ao label, ou false se não for encontrado.
 */
function findFieldByLabel(possibleLabels, win = window) {
    for (let labelText of possibleLabels) {
        let resultadoLabel = Array.from(win.document.querySelectorAll('label')).find(el => el.textContent.trim() === labelText) || false;
        
        if(resultadoLabel) {
            if (resultadoLabel.htmlFor) {
                // Se o label tem um 'htmlFor', ele está associado a um input com esse ID
                return win.document.getElementById(resultadoLabel.htmlFor);
            }
        }
    }
    return false;
}

/**
 * Exibe uma mensagem de sucesso flutuante.
 * @param {string} texto - O texto da mensagem.
 * @param {HTMLElement} local - O elemento HTML onde a mensagem será anexada.
 * @param {number} tempo - O tempo em milissegundos que a mensagem ficará visível.
 */
function successMsg(texto, local, tempo) {
    var alertElement = document.createElement("div");
    alertElement.innerHTML = `<p>${texto}</p>`;
    alertElement.style.position = "fixed";
    alertElement.style.top = "50%";
    alertElement.style.left = "50%";
    alertElement.style.transform = "translate(-50%, -50%)";
    alertElement.style.padding = "20px";
    alertElement.style.background = "linear-gradient(120deg, #007BFF, #00D4BF)"; // Gradiente suave
    alertElement.style.borderRadius = "8px"; // Bordas arredondadas
    alertElement.style.border = "1px solid #ccc";
    alertElement.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)"; // Sombra suave
    alertElement.style.zIndex = 9999999999999;
    alertElement.style.fontFamily = "Arial, sans-serif";
    alertElement.style.fontSize = "16px";
    alertElement.style.color = "#ffffff"; // Texto branco para contraste
    alertElement.style.display = "none"; // Inicia oculto

    if (local) {
        local.appendChild(alertElement);
    }
    alertElement.style.display = "block"; // Exibe
    setTimeout(function () {
        alertElement.style.display = "none"; // Oculta após o tempo
    }, tempo);
}

/**
 * Retorna um objeto com referências aos inputs do formulário de endereço.
 * Usa as traduções para encontrar os rótulos corretos.
 * @param {Window} [win=window] - A janela (window ou iframe) onde buscar os inputs.
 * @returns {object} Um objeto contendo os elementos de input e um método de verificação.
 */
const formInputs = function (win = window) {
    return {
        cep: findFieldByLabel(translations.cep, win),
        rua: findFieldByLabel(translations.rua, win),
        bairro: findFieldByLabel(translations.bairro, win),
        cidade: findFieldByLabel(translations.cidade, win),
        estado: findFieldByLabel(translations.estado, win),
        complemento: findFieldByLabel(translations.complemento, win),
        
        // Verifica se os campos essenciais (CEP, Rua, Complemento) foram encontrados
        wereFounded : function(){
            return this.cep && this.rua && this.complemento;
        },
        win : win
    };
};

/**
 * Tenta preencher os campos de endereço com base no CEP inserido.
 * Esta versão não faz verificação de "hotel premium".
 * @param {object} inputForm - Objeto contendo os elementos dos inputs do formulário.
 */
function mayFillAdress(inputForm){
    if (inputForm.cep.value.length === 8){
        consultarCEP(inputForm.cep.value).then((correiosData) => {
            if(correiosData){
                log.log(correiosData);
                // Preenche os campos desejados
                for (let field of fieldsYouWantToAutoFill){
                    if (correiosData[field] !== undefined){
                        inputForm[field].value = correiosData[field];
                    } else {
                        inputForm[field].value = ""; // Limpa se o dado não existir
                    }
                }
                successMsg('De nada! ;)', document.body, 3000);
            }
        });
    }   
}

/**
 * Percorre a janela principal e os iframes para encontrar os inputs de endereço.
 * Ao encontrar, adiciona um event listener ao campo CEP.
 */
function loopWindowAndFramesAndCheckInputs(){
    // Verifica nos iframes
    for (let i = 0; i < window.frames.length; i++) {
        if(formInputs(window.frames[i]).wereFounded()){
            log.log('Encontrou os inputs em um iframe.');
            // Adiciona listener ao CEP do iframe
            formInputs(window.frames[i]).cep.addEventListener('input', function(){
                mayFillAdress(formInputs(window.frames[i]));
            });
            return; // Retorna após encontrar e adicionar o listener
        }
    }
    
    // Se não encontrou em iframes, verifica na janela principal
    if(formInputs(window).wereFounded()){
        log.log("Encontrou os inputs fora de um frame (na janela principal).");
        // Adiciona listener ao CEP da janela principal
        formInputs(window).cep.addEventListener('input',function(){
            mayFillAdress(formInputs(window));
        });
        return;     
    }

    log.log('Não localizou os inputs de endereço.');
}

// Inicia a execução da extensão
initialize();