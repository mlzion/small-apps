'use strict';
const result = document.querySelector('#result');
const expression = document.querySelector('#expression');
const symbols = { '+': '+', '-': '−', '*': '×', '/': '÷' };
let current = '0';
let stored = null;
let operator = null;
let fresh = true;
let failed = false;

function render() { result.textContent = current; }
function clear() {
  current = '0'; stored = null; operator = null; fresh = true; failed = false;
  expression.textContent = 'Ready to calculate'; render();
}
function digit(value) {
  if (failed) clear();
  if (fresh) { current = value === '.' ? '0.' : value; fresh = false; }
  else if (value === '.') { if (!current.includes('.')) current += '.'; }
  else if (current.replace(/[-.]/g, '').length < 15) current = current === '0' ? value : current + value;
  render();
}
function calculate(a, b, op) {
  if (op === '/' && b === 0) throw new Error('Cannot divide by zero');
  const value = ({ '+': () => a + b, '-': () => a - b, '*': () => a * b, '/': () => a / b })[op]();
  if (!Number.isFinite(value)) throw new Error('Result out of range');
  return Number(value.toPrecision(12));
}
function evaluate() {
  if (!operator || fresh || failed) return;
  const previous = stored, operand = Number(current), op = operator;
  try {
    current = String(calculate(previous, operand, op));
    expression.textContent = previous + ' ' + symbols[op] + ' ' + operand + ' =';
    stored = null; operator = null; fresh = true;
  } catch (error) {
    current = 'Error'; expression.textContent = error.message;
    stored = null; operator = null; fresh = true; failed = true;
  }
  render();
}
function chooseOperator(op) {
  if (failed) return;
  if (operator && !fresh) evaluate();
  if (failed) return;
  stored = Number(current); operator = op; fresh = true;
  expression.textContent = current + ' ' + symbols[op];
}
function backspace() {
  if (failed) { clear(); return; }
  if (fresh) return;
  current = current.length > 1 ? current.slice(0, -1) : '0'; render();
}
document.querySelector('.keys').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.digit !== undefined) digit(button.dataset.digit);
  else if (button.dataset.operator) chooseOperator(button.dataset.operator);
  else ({ clear, backspace, equals: evaluate })[button.dataset.action]();
});
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (/^[0-9.]$/.test(event.key)) digit(event.key);
  else if (symbols[event.key]) chooseOperator(event.key);
  else if (event.key === '=' || event.key === 'Enter') {
    if (event.key === 'Enter' && event.target.closest('button')) return;
    evaluate();
  } else if (event.key === 'Escape' || event.key.toLowerCase() === 'c') clear();
  else if (event.key === 'Backspace') backspace();
  else return;
  event.preventDefault();
});
