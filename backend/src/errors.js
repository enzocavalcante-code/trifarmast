// Erro com status HTTP e mensagem que pode ser exibida ao usuário.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Envolve handlers async para que erros caiam no middleware de erro do Express.
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, asyncHandler };
