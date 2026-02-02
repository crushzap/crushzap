import modal

app = modal.App("example-get-started")


@app.function()
def square(x):
    print("This code is running on a remote worker!")
    return x**2


@app.local_entrypoint()
def main():
    print("the square is", square.remote(42))

    import os
import modal

app = modal.App("teste-secret")

secret = modal.Secret.from_name("crushzap-secrets")

@app.function(secrets=[secret])
def f():
    print(os.environ["WORKFLOW_FILENAME_NODE_ID"])

@app.local_entrypoint()
def main():
    f.remote()