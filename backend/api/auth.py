from functools import lru_cache
import json
import os
from urllib.request import urlopen

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt


bearer_scheme = HTTPBearer(auto_error=False)


def _get_env(name: str) -> str:
	value = os.getenv(name)
	if not value:
		raise RuntimeError(f"Missing required env var: {name}")
	return value


@lru_cache
def _auth_settings():
	domain = _get_env("AUTH0_DOMAIN")
	audience = _get_env("AUTH0_AUDIENCE")
	algorithm = os.getenv("AUTH0_ALGORITHMS", "RS256")
	issuer = f"https://{domain}/"
	jwks_url = f"https://{domain}/.well-known/jwks.json"
	return {
		"domain": domain,
		"audience": audience,
		"algorithm": algorithm,
		"issuer": issuer,
		"jwks_url": jwks_url,
	}


@lru_cache
def _get_jwks():
	settings = _auth_settings()
	with urlopen(settings["jwks_url"]) as response:
		return json.loads(response.read())


def get_current_claims(
	credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
):
	if credentials is None or credentials.scheme.lower() != "bearer":
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Missing bearer token",
		)

	token = credentials.credentials
	settings = _auth_settings()

	try:
		unverified_header = jwt.get_unverified_header(token)
	except JWTError:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Invalid token header",
		)

	jwks = _get_jwks()
	rsa_key = {}
	for key in jwks.get("keys", []):
		if key.get("kid") == unverified_header.get("kid"):
			rsa_key = {
				"kty": key.get("kty"),
				"kid": key.get("kid"),
				"use": key.get("use"),
				"n": key.get("n"),
				"e": key.get("e"),
			}
			break

	if not rsa_key:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Unable to find signing key",
		)

	try:
		claims = jwt.decode(
			token,
			rsa_key,
			algorithms=[settings["algorithm"]],
			audience=settings["audience"],
			issuer=settings["issuer"],
		)
		return claims
	except JWTError:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Invalid token",
		)


def require_permission(permission: str):
	def _checker(claims: dict = Depends(get_current_claims)):
		permissions = claims.get("permissions", [])
		if permission not in permissions:
			raise HTTPException(
				status_code=status.HTTP_403_FORBIDDEN,
				detail="Insufficient permissions",
			)
		return claims

	return _checker
