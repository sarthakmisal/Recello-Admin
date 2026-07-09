const authService = require('../services/auth.service')

// OTP VERIFY
exports.verifyOTP = async (req, res) => {
  const result = await authService.verifyOTP(req.body);
  res.cookie("refreshToken", result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 15 * 24 * 60 * 60 * 1000 // 15 days
  });
  res.status(200).json({ accessToken: result.accessToken, user: result.res_user });
};
// OTP REQUEST
exports.requestOTP = async (req, res) => {

  const result = await authService.requestOTP(req.body);
  res.status(200).json(result);
};
// OTP RESEND
exports.resendOTP = async (req, res) => {
  const result = await authService.resendOTP(req.body);
  res.status(200).json(result);
};
// REGISTRATION
exports.register = async (req, res) => {
  const result = await authService.registerUser(req.body);
  res.status(201).json(result)
};

exports.login = async (req, res) => {
  const result = await authService.loginUser(req.body);
  res.cookie("refreshToken", result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 15 * 24 * 60 * 60 * 1000 // 15 days
  })
  res.status(200).json({ accessToken: result.accessToken, user: result.res_user });
};

exports.refresh = async (req, res) => {
  const result = await authService.refreshToken(req.cookies);
  res.status(200).json(result);
}

exports.me = async (req, res) => {
  const result = await authService.getMe(req.user);
  res.status(200).json({ user: result });
}

exports.logout = async (req, res) => {
  await authService.logoutUser(req.cookies);
  res.clearCookie("refreshToken");
  res.json({ message: "Logged out" });
};

exports.initiateAuth = async (req, res) => {
  const result = await authService.initiateAuth(req.body);
  // res.clearCookie("refreshToken");
  res.status(200).json(result);
};